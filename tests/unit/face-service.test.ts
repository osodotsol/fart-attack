// Synthetic SDK only: importing this test must never load the native runtime or spend credits.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  construct: vi.fn(), select: vi.fn(), start: vi.fn(), stop: vi.fn(), destroy: vi.fn(),
  listeners: new Map<string, (...args: any[]) => void>(),
}));
vi.mock('@smartspectra/node-sdk', () => ({
  SmartSpectraSDK: class {
    constructor(options: unknown) { fake.construct(options); }
    useCamera() { fake.select(); }
    on(name: string, cb: (...args: any[]) => void) { fake.listeners.set(name, cb); }
    start() { fake.start(); }
    stopAsync() { return fake.stop(); }
    destroy() { return fake.destroy(); }
  },
  CameraSelection: { default: { kind: 'default' }, byId: (id: string) => ({ kind: 'byId', id }) },
  faceMetrics: [14], ProcessingStatus: { kRunning: 3 }, ValidationCode: { kOk: 0 },
  SmartSpectraErrorCode: { kInputUnavailable: 7 },
}));
vi.mock('@smartspectra/node-sdk/messages', () => ({ decodeMetrics: vi.fn() }));
import { FaceService } from '../../src/main/faceService';

const sink = () => ({ status: vi.fn(), validation: vi.fn(), samples: vi.fn(), frame: vi.fn(), error: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  fake.listeners.clear();
  fake.stop.mockResolvedValue(undefined);
  fake.destroy.mockResolvedValue(undefined);
});

describe('main-process SDK lifecycle (mocked)', () => {
  it.each(['construct', 'select', 'start'] as const)('returns a safe failure when %s throws, then permits retry', async (stage) => {
    fake[stage].mockImplementationOnce(() => { throw new Error('SYNTHETIC_SECRET must stay in main'); });
    const service = new FaceService('SYNTHETIC_SECRET', undefined, sink());
    await expect(service.start()).resolves.toMatchObject({ ok: false, reason: 'start-failed' });
    if (stage !== 'construct') expect(fake.destroy).toHaveBeenCalledTimes(1);
    const result = await service.start();
    expect(result).toEqual({ ok: true });
    await service.stop();
  });

  it('does not expose raw exception text or SDK error messages to the renderer', async () => {
    fake.start.mockImplementationOnce(() => { throw new Error('SYNTHETIC_SECRET'); });
    const events = sink();
    const service = new FaceService('SYNTHETIC_SECRET', undefined, events);
    expect(JSON.stringify(await service.start())).not.toContain('SYNTHETIC_SECRET');
    await service.start();
    fake.listeners.get('error')!(7, 'SYNTHETIC_SECRET', true);
    expect(events.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'kInputUnavailable', retryable: true }));
    expect(JSON.stringify(events.error.mock.calls)).not.toContain('SYNTHETIC_SECRET');
    await service.stop();
  });

  it('serializes double start and waits for stop/destroy before replacement', async () => {
    const service = new FaceService('SYNTHETIC_SECRET', undefined, sink());
    await Promise.all([service.start(), service.start()]);
    expect(fake.construct).toHaveBeenCalledTimes(1);
    let release!: () => void;
    fake.stop.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const stop = service.stop();
    const restart = service.start();
    await Promise.resolve();
    expect(fake.construct).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([stop, restart]);
    expect(fake.destroy.mock.invocationCallOrder[0]).toBeLessThan(fake.construct.mock.invocationCallOrder[1]);
    expect(fake.construct.mock.calls[1][0]).toMatchObject({ enableTelemetry: false, enableAccumulatedOutput: false });
    await service.stop();
  });

  it('drops callbacks after stopping and destroys even when stop rejects', async () => {
    const events = sink();
    const service = new FaceService('SYNTHETIC_SECRET', undefined, events);
    await service.start();
    fake.stop.mockRejectedValueOnce(new Error('stop failed'));
    await service.stop();
    fake.listeners.get('error')!(7, 'late', true);
    fake.listeners.get('processingStatus')!(3);
    expect(events.error).not.toHaveBeenCalled();
    expect(events.status).not.toHaveBeenCalledWith('running');
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });
});

// F2: renderer ownership uses the same serialized service as production.
import { rendererLifetime } from '../../src/main/rendererLifetime';

describe('F2 renderer lifetime and queued starts', () => {
  it('reload/crash/destroy cleanup is idempotent; old cleanup cannot stop the replacement', async () => {
    const service = new FaceService('SYNTHETIC_ONLY', undefined, sink());
    const owner = rendererLifetime(() => service.stop());
    owner.loaded(); await service.start();
    let release!: () => void;
    fake.stop.mockReturnValueOnce(new Promise<void>(r => { release = r; }));
    const cleanup = owner.release();
    expect(owner.ready).toBe(false);
    expect(owner.release()).toBe(cleanup); // crash/destroy after navigation
    await Promise.resolve();
    owner.loaded(); const replacement = service.start();
    expect(fake.construct).toHaveBeenCalledTimes(1);
    release(); await cleanup; await replacement;
    expect(owner.ready).toBe(true);
    expect(fake.stop).toHaveBeenCalledTimes(1);
    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(fake.construct).toHaveBeenCalledTimes(2);
    fake.listeners.get('processingStatus')!(3);
    await owner.release();
  });

  it('cancels starts queued by the departed document while allowing a fresh start after stop', async () => {
    const service = new FaceService('SYNTHETIC_ONLY', undefined, sink());
    const obsolete = service.start(); const stop = service.stop(); const replacement = service.start();
    expect(await obsolete).toMatchObject({ ok: false });
    await stop; expect(await replacement).toEqual({ ok: true });
    expect(fake.construct).toHaveBeenCalledTimes(1);
    await service.stop();
  });

  it('revokes callbacks synchronously when stop is requested, before teardown runs', async () => {
    const events = sink(); const service = new FaceService('SYNTHETIC_ONLY', undefined, events);
    await service.start(); const stopped = service.stop();
    fake.listeners.get('processingStatus')!(3);
    expect(events.status).not.toHaveBeenCalledWith('running');
    await stopped;
  });
});
