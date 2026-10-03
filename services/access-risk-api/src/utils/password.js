'use strict'

/**
 * Hashing de contrasenas con scrypt (libreria estandar de Node).
 * Se guarda el hash y el salt por separado; la verificacion es en tiempo
 * constante para evitar ataques de temporizacion.
 */

const { randomBytes, scryptSync, timingSafeEqual } = require('crypto')

const KEYLEN = 64

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, KEYLEN).toString('hex')
  return { hash, salt }
}

function verifyPassword(password, hash, salt) {
  const candidate = scryptSync(password, salt, KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function newToken() {
  return randomBytes(32).toString('hex')
}

module.exports = { hashPassword, verifyPassword, newToken }
