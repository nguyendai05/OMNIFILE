import assert from "node:assert/strict";
import test from "node:test";
import { Semaphore } from "./semaphore.ts";

test("a released permit stays reserved for the oldest waiter", async () => {
  const semaphore = new Semaphore(1);
  const releaseFirst = await semaphore.acquire();
  const acquired: string[] = [];
  const waiting = semaphore.acquire().then((release) => {
    acquired.push("waiting");
    return release;
  });
  releaseFirst();
  const newcomer = semaphore.acquire().then((release) => {
    acquired.push("newcomer");
    return release;
  });
  const releaseWaiting = await waiting;
  const duringHandoff = [...acquired];
  const activeDuringHandoff = semaphore.activeCount;
  releaseWaiting();
  const releaseNewcomer = await newcomer;
  releaseNewcomer();
  assert.deepEqual(duringHandoff, ["waiting"]);
  assert.equal(activeDuringHandoff, 1);
  assert.equal(semaphore.activeCount, 0);
});

test("releasing the same permit twice does not free another permit", async () => {
  const semaphore = new Semaphore(2);
  const releaseFirst = await semaphore.acquire();
  const releaseSecond = await semaphore.acquire();
  releaseFirst();
  releaseFirst();
  const releaseThird = await semaphore.acquire();
  const active = semaphore.activeCount;
  releaseSecond();
  releaseThird();
  assert.equal(active, 2);
  assert.equal(semaphore.activeCount, 0);
});

test("double release does not wake two queued tasks", async () => {
  const semaphore = new Semaphore(1);
  const releaseFirst = await semaphore.acquire();
  const acquired: number[] = [];
  const pending = [1, 2].map((id) => semaphore.acquire().then((release) => {
    acquired.push(id);
    return release;
  }));
  releaseFirst();
  releaseFirst();
  const releaseSecond = await pending[0];
  const duringHandoff = [...acquired];
  releaseSecond();
  const releaseThird = await pending[1];
  releaseThird();
  assert.deepEqual(duringHandoff, [1]);
  assert.equal(semaphore.activeCount, 0);
});

test("queued work runs in FIFO order within the concurrency limit", async () => {
  const semaphore = new Semaphore(3);
  const order: number[] = [];
  let running = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 1000 }, async (_, id) => {
    const release = await semaphore.acquire();
    order.push(id);
    running++;
    peak = Math.max(peak, running);
    try {
      await Promise.resolve();
    } finally {
      running--;
      release();
    }
  }));
  assert.deepEqual(order, Array.from({ length: 1000 }, (_, id) => id));
  assert.equal(peak, 3);
  assert.equal(semaphore.activeCount, 0);
  const release = await semaphore.acquire();
  assert.equal(semaphore.activeCount, 1);
  release();
});

test("invalid concurrency limits fail immediately", () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new Semaphore(limit), RangeError);
  }
});
