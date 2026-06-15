import { Cron } from 'croner';

export type ScheduleTaskAdd = {
  name: string;
  cron: string;
  event: () => void | Promise<void>;
};

export class Schedule {
  private tasks = new Map<string, { cron: string; job: Cron }>();

  add({ name, cron, event }: ScheduleTaskAdd) {
    this.cancel(name);
    const job = new Cron(
      cron,
      {
        name,
        catch: (error) => {
          console.error(error);
        },
      },
      event,
    );
    this.tasks.set(name, { cron, job });
  }

  cancel(name: string) {
    const item = this.tasks.get(name);
    if (!item) {
      return;
    }
    item.job.stop();
    this.tasks.delete(name);
  }

  get() {
    return Array.from(this.tasks.entries()).map(([name, { cron, job }]) => ({
      name,
      cron,
      status: job.isRunning(),
    }));
  }
}
