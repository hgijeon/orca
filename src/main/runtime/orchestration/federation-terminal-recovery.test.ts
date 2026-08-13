import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../orca-runtime'

describe('terminal federation acknowledgment recovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('bounds migration replay while prioritizing the newest terminal dispatch', async () => {
    vi.useFakeTimers()
    const candidates = Array.from({ length: 1_000 }, (_, index) => ({
      dispatchId: `dispatch_${index + 1}`,
      rowId: index + 1
    }))
    const runtime = new OrcaRuntimeService(null, undefined, {
      orchestrationEnvironmentTransport: {
        resolve: vi.fn(),
        call: vi.fn()
      }
    })
    const sync = vi
      .spyOn(runtime, 'syncOrchestrationFederatedDispatch')
      .mockResolvedValue(undefined)
    runtime.setOrchestrationDb({
      listActiveFederatedDispatches: () => [],
      findNextTerminalFederatedDispatchPendingAcknowledgment: (afterRowId: number) =>
        candidates.find((candidate) => candidate.rowId > afterRowId),
      findLatestTerminalFederatedDispatchPendingAcknowledgment: () => candidates.at(-1)
    } as never)

    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
    expect(sync.mock.calls).toEqual([['dispatch_1'], ['dispatch_1000']])

    candidates.push({ dispatchId: 'dispatch_1001', rowId: 1_001 })
    await vi.advanceTimersByTimeAsync(3_000)

    expect(sync.mock.calls).toEqual([
      ['dispatch_1'],
      ['dispatch_1000'],
      ['dispatch_2'],
      ['dispatch_1001'],
      ['dispatch_3'],
      ['dispatch_1001'],
      ['dispatch_4'],
      ['dispatch_1001']
    ])
    runtime.stopOrchestrationFederationRelay()
  })

  it('gives every unavailable terminal dispatch a turn before retrying', async () => {
    vi.useFakeTimers()
    const candidates = [1, 2, 3].map((rowId) => ({
      dispatchId: `dispatch_${rowId}`,
      rowId
    }))
    const runtime = new OrcaRuntimeService(null, undefined, {
      orchestrationEnvironmentTransport: {
        resolve: vi.fn(),
        call: vi.fn()
      }
    })
    const sync = vi
      .spyOn(runtime, 'syncOrchestrationFederatedDispatch')
      .mockRejectedValue(new Error('worker unavailable'))
    runtime.setOrchestrationDb({
      listActiveFederatedDispatches: () => [],
      findNextTerminalFederatedDispatchPendingAcknowledgment: (afterRowId: number) =>
        candidates.find((candidate) => candidate.rowId > afterRowId),
      findLatestTerminalFederatedDispatchPendingAcknowledgment: () => candidates.at(-1)
    } as never)

    await vi.advanceTimersByTimeAsync(3_000)

    expect(sync.mock.calls.filter(([dispatchId]) => dispatchId === 'dispatch_3')).toHaveLength(5)
    expect(sync.mock.calls.filter(([dispatchId]) => dispatchId !== 'dispatch_3')).toEqual([
      ['dispatch_1'],
      ['dispatch_2'],
      ['dispatch_1']
    ])
    runtime.stopOrchestrationFederationRelay()
  })

  it('keeps draining history while the newest terminal dispatch is unreachable', async () => {
    vi.useFakeTimers()
    let releaseLatest!: () => void
    const blockedLatest = new Promise<void>((resolve) => (releaseLatest = resolve))
    const historical = [1, 2, 3].map((rowId) => ({
      dispatchId: `dispatch_${rowId}`,
      rowId
    }))
    const latest = { dispatchId: 'dispatch_1000', rowId: 1_000 }
    const runtime = new OrcaRuntimeService(null, undefined, {
      orchestrationEnvironmentTransport: {
        resolve: vi.fn(),
        call: vi.fn()
      }
    })
    const sync = vi
      .spyOn(runtime, 'syncOrchestrationFederatedDispatch')
      .mockImplementation((dispatchId) =>
        dispatchId === latest.dispatchId ? blockedLatest : Promise.resolve()
      )
    runtime.setOrchestrationDb({
      listActiveFederatedDispatches: () => [],
      findNextTerminalFederatedDispatchPendingAcknowledgment: (afterRowId: number) =>
        historical.find((candidate) => candidate.rowId > afterRowId),
      findLatestTerminalFederatedDispatchPendingAcknowledgment: () => latest
    } as never)

    await vi.advanceTimersByTimeAsync(3_000)

    expect(sync.mock.calls.filter(([dispatchId]) => dispatchId === latest.dispatchId)).toHaveLength(
      1
    )
    expect(sync.mock.calls.filter(([dispatchId]) => dispatchId !== latest.dispatchId)).toEqual([
      ['dispatch_1'],
      ['dispatch_2'],
      ['dispatch_3'],
      ['dispatch_1']
    ])
    runtime.stopOrchestrationFederationRelay()
    releaseLatest()
  })

  it('does not restart recovery after relay shutdown', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    const runtime = new OrcaRuntimeService(null, undefined, {
      orchestrationEnvironmentTransport: {
        resolve: vi.fn(),
        call: vi.fn()
      }
    })
    const sync = vi.spyOn(runtime, 'syncOrchestrationFederatedDispatch').mockReturnValue(blocked)
    runtime.setOrchestrationDb({
      listActiveFederatedDispatches: () => [],
      findNextTerminalFederatedDispatchPendingAcknowledgment: () => ({
        dispatchId: 'dispatch_1',
        rowId: 1
      }),
      findLatestTerminalFederatedDispatchPendingAcknowledgment: () => undefined
    } as never)
    expect(sync).toHaveBeenCalledTimes(1)

    runtime.stopOrchestrationFederationRelay()
    release()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sync).toHaveBeenCalledTimes(1)
  })
})
