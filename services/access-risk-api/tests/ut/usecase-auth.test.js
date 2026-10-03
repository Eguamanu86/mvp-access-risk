'use strict'

const { AuthUsecase } = require('../../src/usecases/usecase-auth')
const { hashPassword } = require('../../src/utils/password')

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function repoWithUser(password = 'secret') {
  const { hash, salt } = hashPassword(password, 'fixedsalt')
  return {
    countUsers: jest.fn().mockResolvedValue(1),
    createUser: jest.fn(),
    findUserByEmail: jest.fn().mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      active: true,
      passwordHash: hash,
      passwordSalt: salt,
    }),
    findUserById: jest.fn().mockResolvedValue({ id: 1, email: 'a@b.com', name: 'A', role: 'admin' }),
    touchLogin: jest.fn().mockResolvedValue([1]),
    createSession: jest.fn().mockResolvedValue({}),
    findSession: jest.fn().mockResolvedValue({ token: 't', userId: 1 }),
    revokeSession: jest.fn().mockResolvedValue(true),
  }
}

describe('AuthUsecase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should login with valid credentials', async () => {
    const usecase = new AuthUsecase(repoWithUser('secret'), logger)
    const result = await usecase.login('a@b.com', 'secret')
    expect(result.token).toBeTruthy()
    expect(result.user.role).toBe('admin')
  })

  it('should reject an invalid password', async () => {
    const usecase = new AuthUsecase(repoWithUser('secret'), logger)
    await expect(usecase.login('a@b.com', 'wrong')).rejects.toThrow()
  })

  it('should reject an unknown user', async () => {
    const repo = repoWithUser()
    repo.findUserByEmail.mockResolvedValue(null)
    const usecase = new AuthUsecase(repo, logger)
    await expect(usecase.login('x@y.com', 'secret')).rejects.toThrow()
  })

  it('should require email and password', async () => {
    const usecase = new AuthUsecase(repoWithUser(), logger)
    await expect(usecase.login('', '')).rejects.toThrow()
  })

  it('should logout a session', async () => {
    const usecase = new AuthUsecase(repoWithUser(), logger)
    const result = await usecase.logout('token')
    expect(result.loggedOut).toBe(true)
  })

  it('should return the current user for a valid session', async () => {
    const usecase = new AuthUsecase(repoWithUser(), logger)
    const result = await usecase.me('token')
    expect(result.user.email).toBe('a@b.com')
  })

  it('should reject an invalid session', async () => {
    const repo = repoWithUser()
    repo.findSession.mockResolvedValue(null)
    const usecase = new AuthUsecase(repo, logger)
    await expect(usecase.me('bad')).rejects.toThrow()
  })

  it('should seed default users when the table is empty', async () => {
    const repo = repoWithUser()
    repo.countUsers.mockResolvedValue(0)
    const usecase = new AuthUsecase(repo, logger)
    await usecase.seed()
    expect(repo.createUser).toHaveBeenCalledTimes(3)
  })
})
