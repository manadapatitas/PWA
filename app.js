/**
 * PWA Manada Patitas - Lógica Principal Integrada
 * Incluye: Agenda, Tutores, Ficha Clínica, Peluquería, Inventario, POS / Caja y Escáner QR.
 */

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec";

// Base de datos local en memoria
let inventarioDB = [
  { codigo: "123456", nombre: "comida", categoria: "Alimentos", costo: 0, margen: 0, precioVenta: 13000, stock: 10 },
  { codigo: "1234567", nombre: "burritos", categoria: "Alimentos", costo: 15000, margen: 30, precioVenta: 19500, stock: 10 }
];

let agendaDB = [];
let tutoresDB = [];
let fichasDB = [];
let peluqueriaDB = [];
let carrito = [];

const IVA_RATE = 0.19;
let html5QrCodeScanner = null;

// ==========================================
// INICIALIZACIÓN Y NAVEGACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  renderizarTablaInventario();
  configurarBuscadorPOS();

  // Event listeners para el cálculo automático de Precio de Venta en Inventario
  const inputCosto = document.getElementById('invCosto');
  const inputMargen = document.getElementById('invMargen');
  const inputPrecioVenta = document.getElementById('invPrecioVenta');

  if (inputCosto) inputCosto.addEventListener('input', calcularPrecioVentaDesdeCosto);
  if (inputMargen) inputMargen.addEventListener('input', calcularPrecioVentaDesdeCosto);
  if (inputPrecioVenta) inputPrecioVenta.addEventListener('input', calcularValoresInventario);
});

function switchTab(tabName) {
  document.querySelectorAll('.module-section').forEach(sec => sec.style.display = 'none');
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

  const targetSection = document.getElementById(`module-${tabName}`);
  if (targetSection) {
    targetSection.style.display = 'block';
  }

  // Activar botón navegacion correspondiente
  const buttons = document.querySelectorAll('.nav-tab');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(tabName)) {
      btn.classList.add('active');
    }
  });

  if (tabName === 'pos') {
    const searchInput = document.getElementById('posSearchInput');
    if (searchInput) searchInput.focus();
  }
}

// ==========================================
// MÓDULO 1: AGENDA & CITAS
// ==========================================
async function guardarCitaAgenda() {
  const fechaHora = document.getElementById('agendaFechaHora').value;
  const mascota = document.getElementById('agendaMascota').value.trim();
  const tutor = document.getElementById('agendaTutor').value.trim();
  const servicio = document.getElementById('agendaServicio').value;

  if (!fechaHora || !mascota || !tutor) {
    alert("Por favor completa los campos de fecha, mascota y tutor.");
    return;
  }

  const idCita = "CITA-" + Date.now();
  const nuevaCita = { idCita, fechaHora, mascota, tutor, servicio, estado: "Agendada" };

  agendaDB.push(nuevaCita);
  renderizarAgenda();

  // Enviar a Google Sheets
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "guardarCita",
        ID_Cita: idCita,
        Fecha_Hora: fechaHora,
        Mascota: mascota,
        Tutor: tutor,
        Servicio: servicio,
        Estado: "Agendada"
      })
    });
    alert("✅ Cita agendada con éxito.");
  } catch (err) {
    console.error("Error al guardar cita:", err);
  }

  document.getElementById('agendaMascota').value = '';
  document.getElementById('agendaTutor').value = '';
}

function renderizarAgenda() {
  const tbody = document.getElementById('tablaAgendaBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (agendaDB.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cart">No hay citas registradas.</td></tr>';
    return;
  }

  agendaDB.forEach(cita => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cita.fechaHora}</td>
      <td><strong>${cita.mascota}</strong></td>
      <td>${cita.tutor}</td>
      <td>${cita.servicio}</td>
      <td><span class="badge" style="background: #e3f2fd; color: #0d47a1;">${cita.estado}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// MÓDULO 2: TUTORES Y PACIENTES
// ==========================================
function guardarTutorPaciente() {
  const rut = document.getElementById('tutorRut').value.trim();
  const nombre = document.getElementById('tutorNombre').value.trim();
  const telefono = document.getElementById('tutorTelefono').value.trim();
  const mascota = document.getElementById('mascotaNombre').value.trim();
  const especie = document.getElementById('mascotaEspecie').value.trim();

  if (!rut || !nombre || !mascota) {
    alert("Por favor completa RUT, Nombre del Tutor y Nombre de la Mascota.");
    return;
  }

  tutoresDB.push({ rut, nombre, telefono, mascota, especie });
  alert(`✅ Tutor ${nombre} y paciente ${mascota} registrados exitosamente.`);

  document.getElementById('tutorRut').value = '';
  document.getElementById('tutorNombre').value = '';
  document.getElementById('tutorTelefono').value = '';
  document.getElementById('mascotaNombre').value = '';
  document.getElementById('mascotaEspecie').value = '';
}

// ==========================================
// MÓDULO 3: FICHA CLÍNICA
// ==========================================
function guardarFichaClinica() {
  const mascota = document.getElementById('fichaBuscarMascota').value.trim();
  const anamnesis = document.getElementById('fichaAnamnesis').value.trim();
  const tratamiento = document.getElementById('fichaTratamiento').value.trim();

  if (!mascota || !anamnesis) {
    alert("Por favor especifica la mascota y la anamnesis/motivo de consulta.");
    return;
  }

  fichasDB.push({ idFicha: "F-" + Date.now(), fecha: new Date().toLocaleString("es-CL"), mascota, anamnesis, tratamiento });
  alert("✅ Ficha clínica guardada con éxito.");

  document.getElementById('fichaAnamnesis').value = '';
  document.getElementById('fichaTratamiento').value = '';
}

// ==========================================
// MÓDULO 4: PELUQUERÍA
// ==========================================
function guardarServicioPeluqueria() {
  const mascota = document.getElementById('peluMascota').value.trim();
  const servicio = document.getElementById('peluServicio').value;
  const notas = document.getElementById('peluNotas').value.trim();

  if (!mascota) {
    alert("Ingresa el nombre del paciente/mascota.");
    return;
  }

  peluqueriaDB.push({ fecha: new Date().toLocaleString("es-CL"), mascota, servicio, notas });
  alert(`✅ Servicio de peluquería para ${mascota} registrado.`);

  document.getElementById('peluMascota').value = '';
  document.getElementById('peluNotas').value = '';
}

// ==========================================
// MÓDULO 5: INVENTARIO (CÁLCULOS Y SHEET)
// ==========================================
function calcularPrecioVentaDesdeCosto() {
  const costo = parseFloat(document.getElementById('invCosto').value) || 0;
  const margen = parseFloat(document.getElementById('invMargen').value) || 0;

  if (costo > 0) {
    const netoConMargen = costo * (1 + (margen / 100));
    const precioBrutoFinal = Math.round(netoConMargen * (1 + IVA_RATE));
    document.getElementById('invPrecioVenta').value = precioBrutoFinal;
  }
  calcularValoresInventario();
}

function calcularValoresInventario() {
  const precioVenta = parseFloat(document.getElementById('invPrecioVenta').value) || 0;
  const neto = Math.round(precioVenta / (1 + IVA_RATE));
  const iva = precioVenta - neto;

  document.getElementById('lblNeto').textContent = neto.toLocaleString('es-CL');
  document.getElementById('lblIva').textContent = iva.toLocaleString('es-CL');
  document.getElementById('lblBruto').textContent = precioVenta.toLocaleString('es-CL');
}

function renderizarTablaInventario() {
  const tbody = document.getElementById('tablaInventarioBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  inventarioDB.forEach(prod => {
    const neto = Math.round(prod.precioVenta / (1 + IVA_RATE));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${prod.codigo}</td>
      <td><strong>${prod.nombre}</strong></td>
      <td><span class="badge" style="background: #e0f2f1; color: #004d40;">${prod.categoria}</span></td>
      <td>$${prod.costo.toLocaleString('es-CL')}</td>
      <td>${prod.margen}%</td>
      <td>
        <strong>$${prod.precioVenta.toLocaleString('es-CL')}</strong><br>
        <small style="color: #666;">(Neto: $${neto.toLocaleString('es-CL')} + IVA)</small>
      </td>
      <td><strong style="color: #2e7d32;">${prod.stock} u.</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

async function guardarProductoInventario() {
  const codigo = document.getElementById('invSku').value.trim();
  const nombre = document.getElementById('invNombre').value.trim();
  const categoria = document.getElementById('invCategoria').value;
  const costo = parseFloat(document.getElementById('invCosto').value) || 0;
  const margen = parseFloat(document.getElementById('invMargen').value) || 0;
  const precioVenta = parseFloat(document.getElementById('invPrecioVenta').value) || 0;
  const stock = parseInt(document.getElementById('invStock').value) || 0;

  if (!codigo || !nombre || precioVenta <= 0) {
    alert("Por favor completa el código, nombre y un precio de venta válido.");
    return;
  }

  const payloadProducto = {
    action: "guardarProducto",
    ID_Producto: "PROD-" + Date.now(),
    SKU: codigo,
    Nombre: nombre,
    Categoria: categoria,
    Costo: costo,
    Margen_Pct: margen,
    Precio_Venta: precioVenta,
    Stock: stock,
    Stock_Critico: 2
  };

  try {
    // 1. Guardar localmente
    const idx = inventarioDB.findIndex(p => p.codigo === codigo);
    if (idx >= 0) {
      inventarioDB[idx] = { codigo, nombre, categoria, costo, margen, precioVenta, stock };
    } else {
      inventarioDB.push({ codigo, nombre, categoria, costo, margen, precioVenta, stock });
    }
    renderizarTablaInventario();

    // 2. Enviar a Google Sheets
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadProducto)
    });

    alert("✅ Producto guardado localmente y sincronizado en Google Sheets.");
    document.getElementById('formInventario').reset();
    calcularValoresInventario();

  } catch (err) {
    console.error("Error al guardar producto:", err);
    alert("❌ Ocurrió un error al intentar sincronizar con Google Sheets.");
  }
}

// ==========================================
// MÓDULO 6: POS / CAJA (BUSCADOR, QR Y HOJA)
// ==========================================
function configurarBuscadorPOS() {
  const searchInput = document.getElementById('posSearchInput');
  const dropdown = document.getElementById('searchResultsDropdown');

  if (!searchInput) return;

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

  document.addEventListener('click', (e) => {
    if (dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
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
    if (emptyMsg) emptyMsg.style.display = 'block';
    actualizarTotalesCarrito(0, 0, 0);
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
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

async function finalizarVenta() {
  if (carrito.length === 0) {
    alert("El carrito está vacío.");
    return;
  }

  const metodoPago = document.getElementById('posMetodoPago').value;
  const itemsDetalle = carrito.map(item => `${item.nombre} x${item.cantidad} ($${(item.precioBrutoUnitario * item.cantidad).toLocaleString('es-CL')})`).join(" | ");
  const totalBruto = carrito.reduce((acc, item) => acc + (item.precioBrutoUnitario * item.cantidad), 0);
  const idVenta = "V-" + Date.now();
  const fechaActual = new Date().toLocaleString("es-CL");

  const payloadVenta = {
    action: "registrarVenta",
    ID_Venta: idVenta,
    RUT_Tutor: "S/N",
    Tipo_Documento: "Boleta",
    Nro_Documento: idVenta,
    Items_Detalle: itemsDetalle,
    Total: totalBruto,
    Medio_Pago: metodoPago,
    Usuario_Caja: "Administrador",
    Fecha: fechaActual
  };

  const btnFinalizar = document.getElementById("btnFinalizarVenta");

  try {
    if (btnFinalizar) {
      btnFinalizar.disabled = true;
      btnFinalizar.textContent = "Sincronizando con Google Sheets...";
    }

    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadVenta)
    });

    // Descontar stock local
    carrito.forEach(itemCart => {
      const p = inventarioDB.find(prod => prod.codigo === itemCart.codigo);
      if (p) p.stock -= itemCart.cantidad;
    });

    alert(`✅ Venta ${idVenta} registrada con éxito en Google Sheets.`);

    carrito = [];
    renderizarCarrito();
    renderizarTablaInventario();

  } catch (error) {
    console.error("Error al registrar venta:", error);
    alert("❌ Error al guardar la venta.");
  } finally {
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = "Finalizar Venta";
    }
  }
}

// ==========================================
// ESCÁNER DE CÁMARA (HTML5 QR CODE)
// ==========================================
function toggleScannerCamara() {
  const wrapper = document.getElementById('reader-wrapper');
  if (!wrapper) return;

  if (wrapper.style.display === 'none' || wrapper.style.display === '') {
    wrapper.style.display = 'block';

    if (!html5QrCodeScanner) {
      html5QrCodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      html5QrCodeScanner.render((decodedText) => {
        const prod = inventarioDB.find(p => p.codigo === decodedText);
        if (prod) {
          agregarAlCarrito(prod);
          alert(`✅ Producto escaneado: ${prod.nombre}`);
        } else {
          alert(`Código escaneado (${decodedText}) no encontrado en inventario.`);
        }
      }, (error) => {
        // Ignorar errores de lectura continuos
      });
    }
  } else {
    wrapper.style.display = 'none';
  }
}
