/**
 * Tests unitarios del backend
 */

const request = require('supertest');
const path = require('path');

// Mock de DATABASE_URL para tests
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USER = 'iara';
process.env.ADMIN_PASS = 'pulseras2026';

// Importar la app despues de setear las variables de entorno
const app = require(path.join(__dirname, '..', 'src', 'server.js'));

describe('API Backend', () => {
  test('GET /api/health devuelve ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /api/ping devuelve ok', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /api/products devuelve array', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/auth/login sin credenciales devuelve 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/auth/login credenciales inválidas devuelve 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'wrong', password: 'wrong' });
    expect(res.statusCode).toEqual(401);
  });

  test('POST /api/auth/login correcto devuelve token', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'iara', password: 'pulseras2026' });
    expect(res.statusCode).toEqual(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBe('iara');
  });

  test('GET /api/testimonials devuelve array', async () => {
    const res = await request(app).get('/api/testimonials');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/site-texts devuelve objeto', async () => {
    const res = await request(app).get('/api/site-texts');
    expect(res.statusCode).toEqual(200);
    expect(typeof res.body).toBe('object');
  });

  test('Ruta inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toEqual(404);
  });
});
