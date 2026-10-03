'use strict'

const { AccessRiskUsecase } = require('../../src/usecases/usecase-access-risk')

const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
const signals = { deviceKnown: false, failedAttempts: 3, locationShiftKm: 900, hour: 3, velocityKmh: 900 }

function repoWith(result) {
  return {
    isAvailable: () => true,
    evaluate: jest.fn().mockResolvedValue(result),
    circuit: () => ({ state: 'closed' }),
  }
}

describe('AccessRiskUsecase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should map LOW risk to ALLOW', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.1, level: 'LOW', modelVersion: '1.0.0' }), logger)
    const result = await usecase.evaluate(signals)
    expect(result.decision).toBe('ALLOW')
    expect(result.fallback).toBe(false)
  })

  it('should map MEDIUM risk to REQUIRE_2FA', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.5, level: 'MEDIUM', modelVersion: '1.0.0' }), logger)
    const result = await usecase.evaluate(signals)
    expect(result.decision).toBe('REQUIRE_2FA')
  })

  it('should map HIGH risk to BLOCK', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH', modelVersion: '1.0.0' }), logger)
    const result = await usecase.evaluate(signals)
    expect(result.decision).toBe('BLOCK')
  })

  it('should fallback to REQUIRE_2FA when the model call fails', async () => {
    const repo = {
      isAvailable: () => true,
      evaluate: jest.fn().mockRejectedValue(new Error('down')),
      circuit: () => ({ state: 'open' }),
    }
    const usecase = new AccessRiskUsecase(repo, logger)
    const result = await usecase.evaluate(signals)
    expect(result.fallback).toBe(true)
    expect(result.decision).toBe('REQUIRE_2FA')
  })

  it('should not call the model when the circuit is open', async () => {
    const repo = {
      isAvailable: () => false,
      evaluate: jest.fn(),
      circuit: () => ({ state: 'open' }),
    }
    const usecase = new AccessRiskUsecase(repo, logger)
    const result = await usecase.evaluate(signals)
    expect(result.decision).toBe('REQUIRE_2FA')
    expect(repo.evaluate).not.toHaveBeenCalled()
  })

  it('should reject invalid signals', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.1, level: 'LOW' }), logger)
    await expect(usecase.evaluate({})).rejects.toThrow()
  })

  it('should reject a non-boolean deviceKnown', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.1, level: 'LOW' }), logger)
    await expect(usecase.evaluate({ ...signals, deviceKnown: 'yes' })).rejects.toThrow()
  })

  it('should reject an out-of-range signal', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.1, level: 'LOW' }), logger)
    await expect(usecase.evaluate({ ...signals, failedAttempts: 99 })).rejects.toThrow()
  })

  it('should count decisions in metrics', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.1, level: 'LOW', modelVersion: '1.0.0' }), logger)
    await usecase.evaluate(signals)
    const metrics = usecase.metricsSnapshot()
    expect(metrics.requests).toBe(1)
    expect(metrics.decisions.ALLOW).toBe(1)
  })
})

describe('AccessRiskUsecase feedback', () => {
  const audit = {
    recordDecision: jest.fn().mockResolvedValue(42),
    recordFeedback: jest.fn().mockResolvedValue(true),
    modelMetrics: jest.fn().mockResolvedValue({ labeled: 1, precision: 1 }),
  }

  beforeEach(() => jest.clearAllMocks())

  it('should persist the decision and expose its id', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH', modelVersion: '1.0.0' }), logger, audit)
    const result = await usecase.evaluate(signals)
    expect(result.decisionId).toBe(42)
    expect(audit.recordDecision).toHaveBeenCalled()
  })

  it('should persist username and executionId from the context', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH', modelVersion: '1.0.0' }), logger, audit)
    await usecase.evaluate(signals, { username: 'ana@enviame.io', executionId: 'abc-123' })
    expect(audit.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'ana@enviame.io', executionId: 'abc-123' })
    )
  })

  it('should record feedback for a decision', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH' }), logger, audit)
    const result = await usecase.feedback(42, 'fraud')
    expect(result).toEqual({ id: 42, outcome: 'fraud' })
    expect(audit.recordFeedback).toHaveBeenCalledWith(42, 'fraud')
  })

  it('should reject an invalid outcome', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH' }), logger, audit)
    await expect(usecase.feedback(1, 'maybe')).rejects.toThrow()
  })

  it('should throw when persistence is disabled', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH' }), logger, null)
    await expect(usecase.feedback(1, 'fraud')).rejects.toThrow()
  })

  it('should delegate model metrics to the repository', async () => {
    const usecase = new AccessRiskUsecase(repoWith({ score: 0.9, level: 'HIGH' }), logger, audit)
    const metrics = await usecase.modelMetrics()
    expect(metrics).toEqual({ labeled: 1, precision: 1 })
  })
})
