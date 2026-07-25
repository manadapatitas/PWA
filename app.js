// Variable Global base de datos local / Sincronizable con Google Sheets
let inventarioDB = [
  { codigo: "123456", nombre: "comida", categoria: "Alimentos", costo: 0, margen: 0, precioVenta: 13000, stock: 10 },
  { codigo: "1234567", nombre: "burritos", categoria: "Alimentos", costo: 15000, margen: 30, precioVenta: 19500, stock: 10 }
];

let carrito = [];
const IVA_RATE = 0.19;
let html5QrCodeScanner = null;

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", () => {
  renderizarTablaInventario();
  configurarBuscadorPOS();
  calcularValoresInventario();
});

// Cambiar de Pestañas/Módulos
function switchTab(tabName) {
  document.querySelectorAll('.module-section').forEach(sec => sec.style.display = 'none');
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

  if(tabName === 'inventario') {
    document.getElementById('module-inventario').style.display = 'block';
  } else if(tabName === 'pos') {
    document.getElementById('module-pos').style.display = 'block';
    document.getElementById('posSearchInput').focus();
  }
}

/* ===================================================
   LÓGICA DE INVENTARIO (CONSERVANDO LO SOLUCIONADO)
   =================================================== */
function calcularValoresInventario() {
  const precioVenta = parseFloat(document.getElementById('invPrecioVenta').value) || 0;
  const neto = Math.round(precioVenta / (1 + IVA_RATE));
  const iva = precioVenta - neto;

  document.getElementById('lblNeto').textContent = neto.toLocaleString('es-CL');
  document.getElementById('lblIva').textContent = iva.toLocaleString('es-CL');
  document.getElementById('lblBruto').textContent = precioVenta.toLocaleString('es-CL');
}

document.getElementById('invPrecioVenta')?.addEventListener('input', calcularValoresInventario);

function renderizarTablaInventario() {
  const tbody = document.getElementById('tablaInventarioBody');
  if(!tbody) return;
  tbody.innerHTML = '';

  inventarioDB.forEach(prod => {
    const neto = Math.round(prod.precioVenta / (1 + IVA_RATE));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${prod.codigo}</td>
      <td><strong>${prod.nombre}</strong></td>
      <td><span class="badge">${prod.categoria}</span></td>
      <td>$${prod.costo.toLocaleString('es-CL')}</td>
      <td>${prod.margen}%</td>
      <td>
        <strong>$${prod.precioVenta.toLocaleString('es-CL')}</strong><br>
        <small class="text-muted">(Neto: $${neto.toLocaleString('es-CL')} + IVA)</small>
      </td>
      <td><strong style="color: #2e7d32;">${prod.stock} u.</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function guardarProductoInventario() {
  const codigo = document.getElementById('invSku').value.trim();
  const nombre = document.getElementById('invNombre').value.trim();
  const categoria = document.getElementById('invCategoria').value;
  const costo = parseFloat(document.getElementById('invCosto').value) || 0;
  const margen = parseFloat(document.getElementById('invMargen').value) || 0;
  const precioVenta = parseFloat(document.getElementById('invPrecioVenta').value) || 0;
  const stock = parseInt(document.getElementById('invStock').value) || 0;

  if(!codigo || !nombre || precioVenta <= 0) {
    alert("Por favor completa el código, nombre y precio de venta válido.");
    return;
  }

  const idx = inventarioDB.findIndex(p => p.codigo === codigo);
  if(idx >= 0) {
    inventarioDB[idx] = { codigo, nombre, categoria, costo, margen, precioVenta, stock };
  } else {
    inventarioDB.push({ codigo, nombre, categoria, costo, margen, precioVenta, stock });
  }

  renderizarTablaInventario();
  alert("Producto guardado correctamente.");
  document.getElementById('formInventario').reset();
  calcularValoresInventario();
}

/* ===================================================
   LÓGICA DEL POS / CAJA (NUEVAS MEJORAS)
   =================================================== */

function configurarBuscadorPOS() {
  const searchInput = document.getElementById('posSearchInput');
  const dropdown = document.getElementById('searchResultsDropdown');

  // 1. Escritura para Autocompletar (Live Search)
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 1) {
      dropdown.style.display = 'none';
      return;
    }

    const coincidencias = inventarioDB.filter(p => 
      p.nombre.toLowerCase().includes(query) || p.codigo.toLowerCase().includes(query)
    );

    mostrarDropdownResultados(coincidencias);
  });

  // 2. Soporte para Lector de Código de Barras USB / Tecla Enter
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();
      
      const productoExacto = inventarioDB.find(p => p.codigo === query || p.nombre.toLowerCase() === query.toLowerCase());
      
      if (productoExacto) {
        agregarAlCarrito(productoExacto);
        searchInput.value = '';
        dropdown.style.display = 'none';
      } else {
        alert("Producto no encontrado.");
      }
    }
  });

  // Cerrar desplegable si se hace clic fuera
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function mostrarDropdownResultados(productos) {
  const dropdown = document.getElementById('searchResultsDropdown');
  dropdown.innerHTML = '';

  if (productos.length === 0) {
    dropdown.innerHTML = `<div class="dropdown-item empty">No hay coincidencias en inventario</div>`;
    dropdown.style.display = 'block';
    return;
  }

  productos.forEach(prod => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.innerHTML = `
      <div>
        <strong>${prod.nombre}</strong> <small>(${prod.codigo})</small><br>
        <small class="text-muted">Stock: ${prod.stock} u.</small>
      </div>
      <div class="price-tag">$${prod.precioVenta.toLocaleString('es-CL')}</div>
    `;
    item.onclick = () => {
      agregarAlCarrito(prod);
      document.getElementById('posSearchInput').value = '';
      dropdown.style.display = 'none';
      document.getElementById('posSearchInput').focus();
    };
    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}

function agregarAlCarrito(producto) {
  const existe = carrito.find(p => p.codigo === producto.codigo);

  if (existe) {
    if (existe.cantidad + 1 > producto.stock) {
      alert("Atención: Estás superando el stock disponible (" + producto.stock + " u.)");
    }
    existe.cantidad++;
  } else {
    carrito.push({
      codigo: producto.codigo,
      nombre: producto.nombre,
      precioBrutoUnitario: producto.precioVenta,
      cantidad: 1,
      stockMax: producto.stock
    });
  }

  renderizarCarrito();
}

function cambiarCantidad(codigo, delta) {
  const item = carrito.find(p => p.codigo === codigo);
  if (!item) return;

  item.cantidad += delta;
  if (item.cantidad <= 0) {
    eliminarDelCarrito(codigo);
  } else {
    renderizarCarrito();
  }
}

function eliminarDelCarrito(codigo) {
  carrito = carrito.filter(p => p.codigo !== codigo);
  renderizarCarrito();
}

function renderizarCarrito() {
  const tbody = document.getElementById('cartTableBody');
  const emptyMsg = document.getElementById('emptyCartMsg');
  tbody.innerHTML = '';

  if (carrito.length === 0) {
    emptyMsg.style.display = 'block';
    actualizarTotalesCarrito(0, 0, 0);
    return;
  }

  emptyMsg.style.display = 'none';

  let totalBrutoGeneral = 0;
  let totalNetoGeneral = 0;
  let totalIvaGeneral = 0;

  carrito.forEach(item => {
    const totalBrutoItem = item.precioBrutoUnitario * item.cantidad;
    const totalNetoItem = Math.round(totalBrutoItem / (1 + IVA_RATE));
    const totalIvaItem = totalBrutoItem - totalNetoItem;

    totalBrutoGeneral += totalBrutoItem;
    totalNetoGeneral += totalNetoItem;
    totalIvaGeneral += totalIvaItem;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><small>${item.codigo}</small></td>
      <td><strong>${item.nombre}</strong></td>
      <td>
        <div class="qty-controls">
          <button onclick="cambiarCantidad('${item.codigo}', -1)">-</button>
          <span>${item.cantidad}</span>
          <button onclick="cambiarCantidad('${item.codigo}', 1)">+</button>
        </div>
      </td>
      <td>$${totalNetoItem.toLocaleString('es-CL')}</td>
      <td>$${totalIvaItem.toLocaleString('es-CL')}</td>
      <td><strong>$${totalBrutoItem.toLocaleString('es-CL')}</strong></td>
      <td><button class="btn-delete" onclick="eliminarDelCarrito('${item.codigo}')">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });

  actualizarTotalesCarrito(totalNetoGeneral, totalIvaGeneral, totalBrutoGeneral);
}

function actualizarTotalesCarrito(neto, iva, bruto) {
  document.getElementById('cartSubtotalNeto').textContent = neto.toLocaleString('es-CL');
  document.getElementById('cartTotalIva').textContent = iva.toLocaleString('es-CL');
  document.getElementById('cartTotalBruto').textContent = bruto.toLocaleString('es-CL');
}

function finalizarVenta() {
  if (carrito.length === 0) {
    alert("El carrito está vacío. Selecciona productos antes de procesar.");
    return;
  }

  const metodo = document.getElementById('posMetodoPago').value;
  alert(`✅ Venta procesada exitosamente con ${metodo}.`);
  
  // Descontar Stock Local
  carrito.forEach(itemCart => {
    const p = inventarioDB.find(prod => prod.codigo === itemCart.codigo);
    if(p) p.stock -= itemCart.cantidad;
  });

  carrito = [];
  renderizarCarrito();
  renderizarTablaInventario();
}

/* ===================================================
   MÓDULO DE ESCÁNER VÍA CÁMARA MÓVIL / WEB
   =================================================== */
function abrirCamaraEscaner() {
  document.getElementById('cameraModal').style.display = 'flex';
  
  if (!html5QrCodeScanner) {
    html5QrCodeScanner = new Html5Qrcode("reader");
  }

  const config = { fps: 10, qrbox: { width: 250, height: 150 } };

  html5QrCodeScanner.start(
    { facingMode: "environment" }, // Usa la cámara trasera del teléfono
    config,
    (decodedText) => {
      // Al detectar un código con éxito
      const producto = inventarioDB.find(p => p.codigo === decodedText.trim());
      if (producto) {
        agregarAlCarrito(producto);
        cerrarCamaraEscaner();
      } else {
        alert(`Código ${decodedText} no encontrado en el inventario.`);
      }
    },
    (errorMessage) => {
      // Ignorar errores menores de lectura frame por frame
    }
  ).catch(err => {
    console.error("Error al abrir la cámara:", err);
    alert("No se pudo acceder a la cámara del dispositivo.");
    cerrarCamaraEscaner();
  });
}

function cerrarCamaraEscaner() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.stop().then(() => {
      document.getElementById('cameraModal').style.display = 'none';
    }).catch(err => {
      document.getElementById('cameraModal').style.display = 'none';
    });
  } else {
    document.getElementById('cameraModal').style.display = 'none';
  }
}
