/**
 * 调度器：基于 node-cron 的定时触发 + 手动触发。
 *
 * - start()：按配置 cron 表达式（默认每日 08:00 Asia/Shanghai）定时跑采集；
 *   可通过 CRON_ENABLED 关闭。
 * - runNow()：手动立即触发一次（对应 POST /api/collect/run）。
 * - RUN_ON_START：启动时是否立即跑一次。
 */
import cron from 'node-cron';
import type { Pipeline } from './pipeline';
import type { RegulationRepository } from './db/repository';

export class Scheduler {
  private task?: cron.ScheduledTask;

  constructor(
    private pipeline: Pipeline,
    private repository: RegulationRepository,
    private cronEnabled: boolean,
    private collectionEnabled: boolean,
    private cronExpr: string,
    private timezone = 'Asia/Shanghai',
  ) {}

  /** 启动定时任务 */
  start(): void {
    if (!this.collectionEnabled) {
      console.log(
        '[scheduler] 自动采集已禁用（COLLECTION_ENABLED=false）：' +
          '需配置 LLM Key 并显式将 COLLECTION_ENABLED 设为 true 后才会启动定时采集。',
      );
      return;
    }
    if (!this.cronEnabled) {
      console.log('[scheduler] 定时采集已禁用（CRON_ENABLED=false）');
      return;
    }
    if (!cron.validate(this.cronExpr)) {
      console.error(`[scheduler] 非法 cron 表达式：${this.cronExpr}，定时采集未启动`);
      return;
    }
    this.task = cron.schedule(
      this.cronExpr,
      () => {
        this.runNow().catch((e) =>
          console.error('[scheduler] 定时采集失败:', (e as Error).message),
        );
      },
      { timezone: this.timezone },
    );
    console.log(
      `[scheduler] 定时采集已启动：cron="${this.cronExpr}" tz=${this.timezone}`,
    );
  }

  /** 手动立即触发一次采集 */
  async runNow(): Promise<ReturnType<Pipeline['runOnce']>> {
    return this.pipeline.runOnce();
  }

  /** 停止定时任务 */
  stop(): void {
    this.task?.stop();
  }
}
