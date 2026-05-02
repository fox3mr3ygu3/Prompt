"""Cron container entrypoint — APScheduler runs all 3 jobs on a single loop.

Schedule (UTC):
- payouts:  03:00 daily
- rollup:   every 15 minutes
- sweeper:  every 5 minutes

Re-running any job is idempotent (see each module's docstring).
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ops.cron import payouts, rollup, sweeper


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sched = BlockingScheduler(timezone="UTC")
    sched.add_job(payouts.run, CronTrigger(hour=3, minute=0), id="payouts", max_instances=1)
    sched.add_job(rollup.run, IntervalTrigger(minutes=15), id="rollup", max_instances=1)
    sched.add_job(sweeper.run, IntervalTrigger(minutes=5), id="sweeper", max_instances=1)
    logging.getLogger("cron").info("scheduler started")
    sched.start()


if __name__ == "__main__":
    main()
