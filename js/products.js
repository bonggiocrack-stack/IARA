/* ==================== PRODUCT DATA ==================== */

const defaultProducts = [
  {
    id: 1,
    name: 'Pulsera Minimalista Rosa',
    category: 'pulseras',
    price: 450,
    description: 'Diseño minimalista con cuentas de cerámica en tonos rosa pastel',
    emoji: '📿',
    image: ''
  },
  {
    id: 2,
    name: 'Pulsera Menta Orgánica',
    category: 'pulseras',
    price: 520,
    description: 'Pulsera tejida con materiales ecológicos en tonos verdes',
    emoji: '📿',
    image: ''
  },
  {
    id: 3,
    name: 'Llavero Artesanal',
    category: 'accesorios',
    price: 250,
    description: 'Llavero tejido a mano con detalle floral',
    emoji: '💎',
    image: ''
  },
  {
    id: 4,
    name: 'Souvenir Gualeguay',
    category: 'souvenirs',
    price: 380,
    description: 'Imán decorativo con representación local',
    emoji: '🎁',
    image: ''
  },
  {
    id: 5,
    name: 'Pulsera Bohemia Multi',
    category: 'pulseras',
    price: 590,
    description: 'Pulsera con múltiples hilos y cuentas en tonos variados',
    emoji: '📿',
    image: ''
  },
  {
    id: 6,
    name: 'Collar Artesanal Corto',
    category: 'accesorios',
    price: 650,
    description: 'Collar corto con colgante hecho a mano',
    emoji: '💎',
    image: ''
  },
  {
    id: 7,
    name: 'Pack 3 Pulseras Surtidas',
    category: 'pulseras',
    price: 1200,
    description: 'Set de 3 pulseras con diferentes diseños',
    emoji: '📿',
    image: ''
  },
  {
    id: 8,
    name: 'Brazalete Tejido Premium',
    category: 'pulseras',
    price: 890,
    description: 'Brazalete ancho tejido con técnica tradicional',
    emoji: '📿',
    image: ''
  },
  {
    id: 9,
    name: 'Souvenir Taza Personalizada',
    category: 'souvenirs',
    price: 320,
    description: 'Taza de cerámica con diseño exclusivo de Gualeguay',
    emoji: '🎁',
    image: ''
  },
  {
    id: 10,
    name: 'Anillo Cerámica',
    category: 'accesorios',
    price: 280,
    description: 'Anillo ajustable hecho de cerámica cocida artesanalmente',
    emoji: '💎',
    image: ''
  },
  {
    id: 11,
    name: 'Pulsera Amistad Dual',
    category: 'pulseras',
    price: 480,
    description: 'Pulsera de amistad para compartir en tonos complementarios',
    emoji: '📿',
    image: ''
  },
  {
    id: 12,
    name: 'Marcapáginas Decorativo',
    category: 'souvenirs',
    price: 150,
    description: 'Marcapáginas hecho a mano con técnica mixta',
    emoji: '🎁',
    image: ''
  }
];

let products = (typeof global !== 'undefined' && global.products) ? global.products : defaultProducts;

function setProducts(newProducts) {
  products = newProducts;
}

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      products = await res.json();
    }
  } catch {
    products = defaultProducts;
  }
}

function getProducts() {
  return products;
}

function getProductsByCategory(category) {
  if (category === 'all') return products;
  return products.filter(p => p.category === category);
}

function renderProducts(productsToRender) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  grid.innerHTML = productsToRender.map(product => {
    const imageHtml = product.image
      ? `<img src="${product.image}" alt="${product.name}" loading="lazy" />`
      : product.emoji || '📿';
    const catClass = product.category ? `cat-${product.category}` : '';
    const badgeHtml = product.badge ? `<span class="product-badge">${product.badge}</span>` : '';
    const waMessage = encodeURIComponent(`Hola! Me interesa el producto: ${product.name} - ${formatARS(product.price)}`);
    const waLink = `https://wa.me/${CONFIG.CONTACT.WHATSAPP.replace(/[^\d]/g, '')}?text=${waMessage}`;
    return `
      <div class="product-card reveal">
        <div class="product-image ${catClass}" aria-hidden="true">${imageHtml}</div>
        ${badgeHtml}
        <div class="product-info">
          <span class="product-category">${product.category}</span>
          <h3 class="product-name">${product.name}</h3>
          <p class="product-description">${product.description}</p>
          <div class="product-footer">
            <span class="product-price">${formatARS(product.price)}</span>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn-add-cart" onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, emoji: '${product.emoji || '📿'}', image: '${product.image || ''}', unit: 'u', qty: 1}); event.stopPropagation();">Agregar</button>
              <a href="${waLink}" target="_blank" class="btn-outline btn-sm" rel="noopener" title="Consultar por WhatsApp">💬</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');


  if (window.revealObserver) {
    grid.querySelectorAll('.reveal').forEach(el => {
      if (!el.classList.contains('visible')) {
        window.revealObserver.observe(el);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchProducts();
  renderProducts(getProducts());

  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const category = e.target.dataset.filter;
      renderProducts(getProductsByCategory(category));
    });
  });
});

// Exportar para Node.js (si aplica)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getProducts, getProductsByCategory, renderProducts, fetchProducts, setProducts };
}