import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  SESClient,
  SendEmailCommand,
  SendBulkTemplatedEmailCommand,
} from '@aws-sdk/client-ses';
import * as sgMail from '@sendgrid/mail';
import * as Handlebars from 'handlebars';
import { QUEUE_NAMES } from '../../../api/src/queues/queues.module';
import { Post } from '../../../api/src/modules/posts/entities/post.entity';
import { JobQueue } from '../../../api/src/modules/posts/entities/job-queue.entity';

interface EmailBatchJobData {
  jobQueueId: string;
  campaignId: string;
  postId: string;
  subject: string;
  htmlContent: string;       // Handlebars template
  textContent?: string;
  fromName: string;
  fromEmail: string;
  recipients: Array<{
    email: string;
    name?: string;
    customFields?: Record<string, string>;
  }>;
  batchIndex: number;
  totalBatches: number;
}

@Processor(QUEUE_NAMES.EMAIL_BULK, {
  concurrency: 5,      // 5 batch đồng thời
  limiter: {
    max: 10,           // tối đa 10 batch/giây tổng cộng
    duration: 1000,
  },
})
export class EmailBulkProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailBulkProcessor.name);
  private readonly provider: 'ses' | 'sendgrid';
  private sesClient?: SESClient;

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    @InjectRepository(JobQueue)
    private readonly jobQueueRepo: Repository<JobQueue>,
  ) {
    super();
    this.provider = (process.env.EMAIL_PROVIDER ?? 'ses') as 'ses' | 'sendgrid';
    this.initProvider();
  }

  private initProvider() {
    if (this.provider === 'ses') {
      this.sesClient = new SESClient({
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
      this.logger.log('Email provider: Amazon SES');
    } else {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
      this.logger.log('Email provider: SendGrid');
    }
  }

  async process(job: Job<EmailBatchJobData>): Promise<{ sent: number; failed: number }> {
    const {
      jobQueueId,
      postId,
      subject,
      htmlContent,
      textContent,
      fromName,
      fromEmail,
      recipients,
      batchIndex,
      totalBatches,
    } = job.data;

    this.logger.log(
      `[Job ${job.id}] Sending batch ${batchIndex + 1}/${totalBatches} (${recipients.length} recipients)`,
    );

    await this.jobQueueRepo.update(jobQueueId, {
      status: 'active',
      startedAt: new Date(),
    });

    // ── Compile Handlebars template ─────────────────────────────
    const htmlTemplate = Handlebars.compile(htmlContent);
    const textTemplate = textContent ? Handlebars.compile(textContent) : null;

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    if (this.provider === 'ses') {
      // SES: Gửi từng email với personalization
      const results = await Promise.allSettled(
        recipients.map((r) =>
          this.sendViaSES({
            to: r.email,
            toName: r.name,
            fromEmail,
            fromName,
            subject,
            html: htmlTemplate({ name: r.name, ...r.customFields }),
            text: textTemplate
              ? textTemplate({ name: r.name, ...r.customFields })
              : undefined,
          }),
        ),
      );

      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          sent++;
        } else {
          failed++;
          errors.push(`${recipients[i].email}: ${r.reason}`);
        }
      });
    } else {
      // SendGrid: Dùng personalizations để gửi bulk hiệu quả hơn
      const messages = recipients.map((r) => ({
        to: { email: r.email, name: r.name },
        from: { email: fromEmail, name: fromName },
        subject,
        html: htmlTemplate({ name: r.name, ...r.customFields }),
        text: textTemplate
          ? textTemplate({ name: r.name, ...r.customFields })
          : undefined,
      }));

      try {
        await sgMail.send(messages as any, true); // isMultiple = true
        sent = recipients.length;
      } catch (e: any) {
        failed = recipients.length;
        errors.push(e.message);
      }
    }

    // ── Cập nhật kết quả vào DB ─────────────────────────────────
    await this.jobQueueRepo.update(jobQueueId, {
      status: failed === recipients.length ? 'failed' : 'completed',
      finishedAt: new Date(),
      result: { sent, failed, totalInBatch: recipients.length },
      error: errors.length > 0 ? errors.slice(0, 5).join('\n') : undefined,
    });

    // Nếu đây là batch cuối, cập nhật post status
    if (batchIndex === totalBatches - 1 && failed < recipients.length) {
      await this.postRepo.update(postId, {
        status: 'posted',
        postedAt: new Date(),
      });
    }

    this.logger.log(
      `✅ Batch ${batchIndex + 1}: sent=${sent}, failed=${failed}`,
    );
    return { sent, failed };
  }

  private async sendViaSES(opts: {
    to: string;
    toName?: string;
    fromEmail: string;
    fromName: string;
    subject: string;
    html: string;
    text?: string;
  }) {
    const cmd = new SendEmailCommand({
      Source: `${opts.fromName} <${opts.fromEmail}>`,
      Destination: {
        ToAddresses: [opts.toName ? `${opts.toName} <${opts.to}>` : opts.to],
      },
      Message: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: opts.html, Charset: 'UTF-8' },
          ...(opts.text
            ? { Text: { Data: opts.text, Charset: 'UTF-8' } }
            : {}),
        },
      },
    });
    await this.sesClient!.send(cmd);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Email batch job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`❌ Email batch job ${job.id} failed: ${err.message}`);
  }
}
