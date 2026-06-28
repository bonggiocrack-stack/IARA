/**
 * Tests unitarios para products.js
 */

// Mock de CONFIG y formatARS
global.CONFIG = {
  ANIMATIONS: { TOAST_DURATION: 3000, REVEAL_THRESHOLD: 0.15 }
};
global.formatARS = (amount) => `$${amount}`;

// Mock DOM
document.createElement = (_tag) => ({
  className: '',
  innerHTML: '',
  textContent: '',
  style: {},
  getContext: () => ({}),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  classList: {
    add: () => {},
    contains: () => false
  }
});
document.getElementById = () => null;
document.querySelectorAll = () => [];

describe('products.js', () => {
  let productsModule;

  beforeEach(() => {
    jest.resetModules();
    productsModule = require('../js/products');
    productsModule.setProducts([
      { id: 1, name: 'Test', category: 'pulseras', price: 100 },
      { id: 2, name: 'Test2', category: 'accesorios', price: 200 },
      { id: 3, name: 'Test3', category: 'souvenirs', price: 300 }
    ]);
  });

  test('getProducts devuelve el array actual', () => {
    expect(productsModule.getProducts().length).toBe(3);
  });

  test('getProductsByCategory filtra por categoría', () => {
    expect(productsModule.getProductsByCategory('pulseras').length).toBe(1);
    expect(productsModule.getProductsByCategory('accesorios').length).toBe(1);
    expect(productsModule.getProductsByCategory('all').length).toBe(3);
  });

  test('getProductsByCategory con categoría inexistente devuelve vacío', () => {
    expect(productsModule.getProductsByCategory('nonexistent').length).toBe(0);
  });
});
