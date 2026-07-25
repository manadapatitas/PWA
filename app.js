/* ==========================================
   CONFIGURACIÓN Y SCRIPT DE GOOGLE APPS SCRIPT
   ========================================== */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqZ-7QZ2yP9U_YgS_CjJ7v5o1R6d5N11q9l_k_8K7X/exec"; // Reemplazar con tu URL de Web App si varía

// Estado Global
let globalProducts = [];
let cart = [];
let html5QrCode = null;
let activeScanTarget = null; // 'inv' o 'pos'

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initAutoCalculoInventario();
  initPOS();
  initForms();
  loadAllData();
});

/* ==========================================
   1. SISTEMA DE NAVEGACIÓN Y PESTAÑAS
   ========================================== */
function initTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  const sections = document.querySelectorAll(".module-section");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-target");

      tabs.forEach(t => t.classList.remove("active"));
      sections.forEach(s => s.classList.remove("active"));

      tab.classList.add("active");
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add("active");
    });
  });
}

/* ==========================================
   2. CARGA DE DATOS DESDE GOOGLE SHEETS
   ========================================== */
async function loadAllData() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getData`);
    if (!res.ok) throw new Error("Error en la conexión");
    const data = await res.json();

    if (data.inventario) {
      globalProducts = data.inventario;
      renderTablaInventario(globalProducts);
    }
    if (data.agenda) renderTablaAgenda(data.agenda);
    if (data.tutores) renderTablaTutores(data.tutores);
    if (data.clinica) renderTablaClinica(data.clinica);
    if (data.peluqueria) renderTablaPeluqueria(data.peluqueria);

  } catch (err) {
    console.warn("No se pudo cargar de Sheets (o modo offline). Cargando interfaz vacía:", err);
    renderTablaInventario([]);
    renderTablaAgenda([]);
    renderTablaTutores([]);
    renderTablaClinica([]);
    renderTablaPeluqueria([]);
  }
}

/* ==========================================
   3. RENDERS DE TABLAS
   ========================================== */
function renderTablaAgenda(list) {
  const tbody = document.getElementById("tablaAgendaBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No hay citas registradas.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.fecha || item.Fecha || ''}</td>
      <td><strong>${item.mascota || item.Mascota || ''}</strong></td>
      <td>${item.tutor || item.Tutor || ''}</td>
      <td>${item.servicio || item.Servicio || ''}</td>
      <td><span class="badge">Agendado</span></td>
    </tr>
  `).join('');
}

function renderTablaTutores(list) {
  const tbody = document.getElementById("tablaTutoresBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No hay tutores registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.rut || item.RUT || ''}</td>
      <td><strong>${item.tutor || item.Tutor || ''}</strong></td>
      <td>${item.telefono || item.Telefono || ''}</td>
      <td>${item.mascota || item.Mascota || ''}</td>
      <td>${item.especie || item.Especie || ''}</td>
    </tr>
  `).join('');
}

function renderTablaClinica(list) {
  const tbody = document.getElementById("tablaClinicaBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">No hay fichas registradas.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.fecha || item.Fecha || new Date().toLocaleDateString()}</td>
      <td><strong>${item.paciente || item.Paciente || ''}</strong></td>
      <td>${item.anamnesis || item.Anamnesis || ''}</td>
      <td>${item.diagnostico || item.Diagnostico || ''}</td>
    </tr>
  `).join('');
}

function renderTablaPeluqueria(list) {
  const tbody = document.getElementById("tablaPeluqueriaBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">No hay registros de peluquería.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.fecha || item.Fecha || new Date().toLocaleDateString()}</td>
      <td><strong>${item.mascota || item.Mascota || ''}</strong></td>
      <td>${item.servicio || item.Servicio || ''}</td>
      <td>${item.obs || item.Observaciones || ''}</td>
    </tr>
  `).join('');
}

function renderTablaInventario(list) {
  const tbody = document.getElementById("tablaInventarioBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888;">No hay productos en inventario.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(prod => `
    <tr>
      <td><code>${prod.sku || prod.SKU || ''}</code></td>
      <td><strong>${prod.nombre || prod.Nombre || ''}</strong></td>
      <td>${prod.categoria || prod.Categoria || ''}</td>
      <td>$${Number(prod.costo || prod.Costo || 0).toLocaleString('es-CL')}</td>
      <td><strong>$${Number(prod.precioVenta || prod.PrecioVenta || prod.precio || 0).toLocaleString('es-CL')}</strong></td>
      <td><span class="badge">${prod.stock || prod.Stock || 0} un.</span></td>
    </tr>
  `).join('');
}

/* ==========================================
   4. MANEJO DE FORMULARIOS (ENVÍO)
   ========================================== */
function initForms() {
  // FORM AGENDA
  document.getElementById("formAgenda").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      action: "addAgenda",
      fecha: document.getElementById("agendaFecha").value,
      mascota: document.getElementById("agendaMascota").value,
      tutor: document.getElementById("agendaTutor").value,
      servicio: document.getElementById("agendaServicio").value
    };
    sendToBackend(payload, "Cita agendada con éxito");
    e.target.reset();
  });

  // FORM TUTORES
  document.getElementById("formTutores").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      action: "addTutor",
      rut: document.getElementById("tutorRut").value,
      tutor: document.getElementById("tutorNombre").value,
      telefono: document.getElementById("tutorTelefono").value,
      mascota: document.getElementById("mascotaNombre").value,
      especie: document.getElementById("mascotaEspecie").value
    };
    sendToBackend(payload, "Tutor y Paciente registrados");
    e.target.reset();
  });

  // FORM CLÍNICA
  document.getElementById("formClinica").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      action: "addClinica",
      paciente: document.getElementById("clinicaMascota").value,
      anamnesis: document.getElementById("clinicaAnamnesis").value,
      diagnostico: document.getElementById("clinicaDiagnostico").value,
      fecha: new Date().toLocaleDateString()
    };
    sendToBackend(payload, "Ficha Clínica guardada");
    e.target.reset();
  });

  // FORM PELUQUERÍA
  document.getElementById("formPeluqueria").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      action: "addPeluqueria",
      mascota: document.getElementById("peluMascota").value,
      servicio: document.getElementById("peluServicio").value,
      obs: document.getElementById("peluObs").value,
      fecha: new Date().toLocaleDateString()
    };
    sendToBackend(payload, "Registro de Peluquería guardado");
    e.target.reset();
  });

  // BOTÓN GUARDAR INVENTARIO
  document.getElementById("btnGuardarProducto").addEventListener("click", () => {
    const sku = document.getElementById("invSku").value;
    const nombre = document.getElementById("invNombre").value;
    const costo = parseFloat(document.getElementById("invCosto").value) || 0;
    const margen = parseFloat(document.getElementById("invMargen").value) || 0;
    const stock = parseInt(document.getElementById("invStock").value) || 0;
    const categoria = document.getElementById("invCategoria").value;

    if (!sku || !nombre || costo <= 0) {
      alert("Por favor complete los campos obligatorios del producto.");
      return;
    }

    const neto = costo * (1 + (margen / 100));
    const precioBruto = Math.round(neto * 1.19);

    const payload = {
      action: "addProducto",
      sku,
      nombre,
      categoria,
      costo,
      margen,
      precioVenta: precioBruto,
      stock
    };

    sendToBackend(payload, "Producto agregado al inventario");
    
    // Agregar localmente a globalProducts para reflejo inmediato en POS
    globalProducts.push({ sku, nombre, categoria, costo, precioVenta: precioBruto, stock });
    renderTablaInventario(globalProducts);

    document.getElementById("formInventario").reset();
    calcularValoresInventario();
  });
}

async function sendToBackend(payload, successMsg) {
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert(successMsg);
    loadAllData();
  } catch (err) {
    alert("Error enviando datos: " + err.message);
  }
}

/* ==========================================
   5. CÁLCULO DINÁMICO DE PRECIOS INVENTARIO
   ========================================== */
function initAutoCalculoInventario() {
  const costoInp = document.getElementById("invCosto");
  const margenInp = document.getElementById("invMargen");

  costoInp.addEventListener("input", calcularValoresInventario);
  margenInp.addEventListener("input", calcularValoresInventario);
}

function calcularValoresInventario() {
  const costo = parseFloat(document.getElementById("invCosto").value) || 0;
  const margen = parseFloat(document.getElementById("invMargen").value) || 0;

  const neto = costo * (1 + (margen / 100));
  const iva = neto * 0.19;
  const bruto = Math.round(neto + iva);

  document.getElementById("valNeto").innerText = `$${Math.round(neto).toLocaleString('es-CL')}`;
  document.getElementById("valIva").innerText = `$${Math.round(iva).toLocaleString('es-CL')}`;
  document.getElementById("valBruto").innerText = `$${bruto.toLocaleString('es-CL')}`;
}

/* ==========================================
   6. MÓDULO POS / CAJA & CARRITO
   ========================================== */
function initPOS() {
  const searchInput = document.getElementById("posSearchInput");
  const dropdown = document.getElementById("posDropdownResults");

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      dropdown.style.display = "none";
      return;
    }

    const filtered = globalProducts.filter(p => 
      (p.nombre || p.Nombre || '').toLowerCase().includes(query) || 
      (p.sku || p.SKU || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-item empty">Sin resultados</div>`;
    } else {
      dropdown.innerHTML = filtered.map(p => `
        <div class="dropdown-item" onclick="agregarAlCarrito('${p.sku || p.SKU}')">
          <div>
            <strong>${p.nombre || p.Nombre}</strong><br>
            <small>SKU: ${p.sku || p.SKU} | Stock: ${p.stock || p.Stock}</small>
          </div>
          <div><strong>$${Number(p.precioVenta || p.PrecioVenta || p.precio || 0).toLocaleString('es-CL')}</strong></div>
        </div>
      `).join('');
    }
    dropdown.style.display = "block";
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pos-search-wrapper")) {
      dropdown.style.display = "none";
    }
  });

  document.getElementById("btnProcesarVenta").addEventListener("click", procesarVenta);
}

window.agregarAlCarrito = function(sku) {
  const product = globalProducts.find(p => (p.sku || p.SKU) === sku);
  if (!product) return;

  const existing = cart.find(item => item.sku === sku);
  if (existing) {
    existing.cantidad += 1;
  } else {
    cart.push({
      sku: product.sku || product.SKU,
      nombre: product.nombre || product.Nombre,
      precio: Number(product.precioVenta || product.PrecioVenta || product.precio || 0),
      cantidad: 1
    });
  }

  document.getElementById("posSearchInput").value = "";
  document.getElementById("posDropdownResults").style.display = "none";
  renderCart();
};

function renderCart() {
  const tbody = document.getElementById("posCartBody");
  if (cart.length === 0) {
    tbody.innerHTML = `<tr id="emptyCartRow"><td colspan="5" class="empty-cart">El carrito está vacío</td></tr>`;
    document.getElementById("posTotalAmount").innerText = "$0";
    return;
  }

  let total = 0;
  tbody.innerHTML = cart.map((item, index) => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    return `
      <tr>
        <td><strong>${item.nombre}</strong></td>
        <td>
          <div class="qty-controls">
            <button onclick="updateQty(${index}, -1)">-</button>
            <span>${item.cantidad}</span>
            <button onclick="updateQty(${index}, 1)">+</button>
          </div>
        </td>
        <td>$${item.precio.toLocaleString('es-CL')}</td>
        <td>$${subtotal.toLocaleString('es-CL')}</td>
        <td><button class="btn-delete" onclick="removeFromCart(${index})">🗑️</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById("posTotalAmount").innerText = `$${total.toLocaleString('es-CL')}`;
}

window.updateQty = function(index, delta) {
  cart[index].cantidad += delta;
  if (cart[index].cantidad <= 0) {
    cart.splice(index, 1);
  }
  renderCart();
};

window.removeFromCart = function(index) {
  cart.splice(index, 1);
  renderCart();
};

async function procesarVenta() {
  if (cart.length === 0) {
    alert("El carrito está vacío.");
    return;
  }

  const total = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const rutTutor = document.getElementById("posRutTutor").value || "S/N";
  const tipoDoc = document.getElementById("posTipoDoc").value;
  const medioPago = document.getElementById("posMetodoPago").value;
  const idVenta = "V-" + Date.now();

  const itemsDetalle = cart.map(i => `${i.nombre} x${i.cantidad} ($${i.precio.toLocaleString('es-CL')})`).join(" | ");

  const payload = {
    action: "registrarVenta",
    idVenta: idVenta,
    rutTutor: rutTutor,
    tipoDoc: tipoDoc,
    nroDoc: idVenta,
    items: itemsDetalle,
    total: total,
    medioPago: medioPago,
    usuario: "Administrador",
    fecha: new Date().toLocaleString()
  };

  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert(`Venta ${idVenta} procesada correctamente por un total de $${total.toLocaleString('es-CL')}`);
    cart = [];
    renderCart();
    document.getElementById("posRutTutor").value = "";
  } catch (err) {
    alert("Error al procesar la venta: " + err.message);
  }
}
