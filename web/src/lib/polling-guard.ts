/**
 * 双保险长任务轮询守护机制（借鉴 CopyDance / 生产级长任务防卡死设计）：
 * 1. 快速唤醒：监听 visibilitychange、focus、online 事件，当页面切回前台或网络恢复时立即中断等待，触发即时状态对齐；
 * 2. 真实时间截止：使用绝对时间戳计算超时（默认 15 分钟），规避后台标签页定时器被浏览器限频/休眠导致循环轮次被拖死；
 * 3. 自适应轮询间隔：前 30 秒高频（2s），中段适中（3s），长任务平稳（4s），兼顾即时性与服务负载。
 */

export const DEFAULT_TASK_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟

/**
 * 可中断且受切台唤醒的高级延时函数。
 * 当用户离开标签页后重新切回，或窗口重新获取焦点、网络重连时，会立刻提前唤醒，立即进行下一轮状态对齐。
 */
export function resilientDelay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }

        let timer: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        const cleanup = () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", onWakeup);
            }
            if (typeof window !== "undefined") {
                window.removeEventListener("focus", onWakeup);
                window.removeEventListener("online", onWakeup);
            }
            signal?.removeEventListener("abort", onAbort);
        };

        const done = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };

        const onAbort = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        };

        const onWakeup = () => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") {
                done();
            }
        };

        timer = setTimeout(done, Math.max(100, ms));
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", onWakeup, { passive: true });
        }
        if (typeof window !== "undefined") {
            window.addEventListener("focus", onWakeup, { passive: true });
            window.addEventListener("online", onWakeup, { passive: true });
        }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * 监听页面切回可见状态（切前台、亮屏、获焦）的注册助手，返回取消订阅函数。
 */
export function onPageWakeup(callback: () => void): () => void {
    if (typeof document === "undefined") return () => {};

    const handleWakeup = () => {
        if (document.visibilityState === "visible") {
            try {
                callback();
            } catch (err) {
                console.error("[polling-guard] Wakeup callback failed", err);
            }
        }
    };

    document.addEventListener("visibilitychange", handleWakeup, { passive: true });
    if (typeof window !== "undefined") {
        window.addEventListener("focus", handleWakeup, { passive: true });
        window.addEventListener("online", handleWakeup, { passive: true });
    }

    return () => {
        document.removeEventListener("visibilitychange", handleWakeup);
        if (typeof window !== "undefined") {
            window.removeEventListener("focus", handleWakeup);
            window.removeEventListener("online", handleWakeup);
        }
    };
}

/**
 * 计算动态自适应轮询等待时间
 */
export function getAdaptivePollInterval(elapsedMs: number): number {
    if (elapsedMs < 30_000) return 2000;
    if (elapsedMs < 120_000) return 3000;
    return 4000;
}
