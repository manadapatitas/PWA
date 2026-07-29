// =================================================================
// MANADA PATITAS — SITIO PÚBLICO (tienda.js)
// Lógica compartida entre todas las páginas del sitio de clientes.
// =================================================================

const URL_WEB_APP = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec";
const CLAVE_CARRITO = "mp_carrito_cliente";

// -----------------------------------------------------------------
// UTILIDADES
// -----------------------------------------------------------------
function formatearCLP(valor) {
  return `$${Math.round(Number(valor) || 0).toLocaleString('es-CL')}`;
}

async function llamarBackend(accion, payload = {}) {
  const res = await fetch(URL_WEB_APP, {
    method: 'POST',
    body: JSON.stringify({ accion, ...payload })
  });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error('El servidor no respondió correctamente. Intenta más tarde.');
  }
  if (json.status === 'error') throw new Error(json.message);
  return json;
}

function formatearInputRut(input) {
  if (!input) return;
  let str = input.value.replace(/[^0-9kK]/g, '').toUpperCase();
  input.value = str.length <= 1 ? str : str.slice(0, -1) + '-' + str.slice(-1);
}

// -----------------------------------------------------------------
// NAV MÓVIL (hamburguesa)
// -----------------------------------------------------------------
function inicializarNavMovil() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('nav-links-abierto');
    });
  }
}

// -----------------------------------------------------------------
// CARRITO (persistido en localStorage: es normal y esperado en una
// tienda online pública, para que el carrito sobreviva entre páginas).
// -----------------------------------------------------------------
function obtenerCarrito() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CARRITO)) || [];
  } catch (e) {
    return [];
  }
}

function guardarCarrito(carrito) {
  localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
  actualizarBadgeCarrito();
}

function agregarAlCarritoPublico(sku, nombre, precio, stockMax) {
  const carrito = obtenerCarrito();
  const existente = carrito.find(i => i.sku === sku);
  if (existente) {
    if (existente.cantidad < stockMax) {
      existente.cantidad += 1;
    } else {
      mostrarToast('No hay más stock disponible de este producto.');
      return;
    }
  } else {
    carrito.push({ sku, nombre, precio, cantidad: 1, stockMax });
  }
  guardarCarrito(carrito);
  mostrarToast(`${nombre} agregado al carrito 🛒`);
  renderizarPanelCarrito();
}

function modificarCantidadCarritoPublico(sku, delta) {
  const carrito = obtenerCarrito();
  const item = carrito.find(i => i.sku === sku);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad > item.stockMax) item.cantidad = item.stockMax;
  if (item.cantidad <= 0) {
    const idx = carrito.indexOf(item);
    carrito.splice(idx, 1);
  }
  guardarCarrito(carrito);
  renderizarPanelCarrito();
}

function actualizarBadgeCarrito() {
  const carrito = obtenerCarrito();
  const totalUnidades = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  const badge = document.getElementById('badge-carrito');
  if (badge) {
    badge.innerText = totalUnidades;
    badge.classList.toggle('oculto', totalUnidades === 0);
  }
}

function abrirPanelCarrito() {
  const panel = document.getElementById('panel-carrito');
  const overlay = document.getElementById('overlay-carrito');
  if (panel) panel.classList.add('abierto');
  if (overlay) overlay.classList.add('visible');
  renderizarPanelCarrito();
}

function cerrarPanelCarrito() {
  const panel = document.getElementById('panel-carrito');
  const overlay = document.getElementById('overlay-carrito');
  if (panel) panel.classList.remove('abierto');
  if (overlay) overlay.classList.remove('visible');
}

function renderizarPanelCarrito() {
  const contenedor = document.getElementById('carrito-items-lista');
  const totalEl = document.getElementById('carrito-total');
  const btnPagar = document.getElementById('btn-ir-a-pagar');
  if (!contenedor) return;

  const carrito = obtenerCarrito();

  if (carrito.length === 0) {
    contenedor.innerHTML = '<p style="color:#8a9998; text-align:center; margin-top:30px;">Tu carrito está vacío</p>';
    if (totalEl) totalEl.innerText = formatearCLP(0);
    if (btnPagar) btnPagar.disabled = true;
    return;
  }

  let total = 0;
  contenedor.innerHTML = carrito.map(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    return `
      <div class="carrito-item-row">
        <div style="flex:1;">
          <strong>${item.nombre}</strong><br>
          <small class="dato-mono">${formatearCLP(item.precio)} c/u</small>
        </div>
        <div class="cantidad-controles">
          <button onclick="modificarCantidadCarritoPublico('${item.sku}', -1)">-</button>
          <span>${item.cantidad}</span>
          <button onclick="modificarCantidadCarritoPublico('${item.sku}', 1)">+</button>
        </div>
        <strong class="dato-mono">${formatearCLP(subtotal)}</strong>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.innerText = formatearCLP(total);
  if (btnPagar) btnPagar.disabled = false;
}

// Pequeño aviso flotante no intrusivo
function mostrarToast(texto) {
  let toast = document.getElementById('toast-mp');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-mp';
    toast.style.cssText = `
      position: fixed; bottom: 90px; right: 22px; z-index: 300;
      background: #06302f; color: #f1faf9; padding: 12px 18px;
      border-radius: 12px; font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 0.9rem; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      opacity: 0; transition: opacity .25s;
    `;
    document.body.appendChild(toast);
  }
  toast.innerText = texto;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

// -----------------------------------------------------------------
// CATÁLOGO (página tienda.html)
// -----------------------------------------------------------------
let catalogoCompleto = [];
let categoriaActiva = 'Todas';

async function cargarCatalogoPublico() {
  const grid = document.getElementById('grid-productos-publico');
  if (!grid) return;

  try {
    const json = await llamarBackend('obtenerCatalogoPublico');
    catalogoCompleto = json.catalogo || [];
    construirFiltrosCategoria();
    renderizarCatalogo();
  } catch (err) {
    grid.innerHTML = `<p class="aviso aviso-error">No se pudo cargar el catálogo: ${err.message}</p>`;
  }
}

function construirFiltrosCategoria() {
  const contenedor = document.getElementById('filtros-categoria');
  if (!contenedor) return;

  const categorias = ['Todas', ...new Set(catalogoCompleto.map(p => p.categoria || 'General'))];
  contenedor.innerHTML = categorias.map(cat => `
    <button class="chip-categoria ${cat === categoriaActiva ? 'activo' : ''}" onclick="filtrarPorCategoria('${cat}')">${cat}</button>
  `).join('');
}

function filtrarPorCategoria(categoria) {
  categoriaActiva = categoria;
  construirFiltrosCategoria();
  renderizarCatalogo();
}

function renderizarCatalogo() {
  const grid = document.getElementById('grid-productos-publico');
  const inputBuscar = document.getElementById('buscar-producto-publico');
  if (!grid) return;

  const termino = inputBuscar ? inputBuscar.value.toLowerCase().trim() : '';

  const filtrados = catalogoCompleto.filter(p => {
    const coincideCategoria = categoriaActiva === 'Todas' || (p.categoria || 'General') === categoriaActiva;
    const coincideBusqueda = !termino || (p.nombre || '').toLowerCase().includes(termino);
    return coincideCategoria && coincideBusqueda;
  });

  if (filtrados.length === 0) {
    grid.innerHTML = '<p style="grid-column:1/-1; color:#8a9998; text-align:center;">No encontramos productos con ese filtro.</p>';
    return;
  }

  grid.innerHTML = filtrados.map(p => `
    <div class="producto-card">
      <div class="producto-imagen">🐾</div>
      <span class="categoria">${p.categoria || 'General'}</span>
      <h4>${p.nombre}</h4>
      <div class="precio">${formatearCLP(p.precio)}</div>
      <div class="stock-info">${p.stock > 5 ? 'Disponible' : `Últimas ${p.stock} unidades`}</div>
      <button class="btn btn-secundario btn-block" onclick="agregarAlCarritoPublico('${p.sku}', '${p.nombre.replace(/'/g, "\\'")}', ${p.precio}, ${p.stock})">Agregar al carrito</button>
    </div>
  `).join('');
}

// -----------------------------------------------------------------
// CHECKOUT / PAGO CON WEBPAY
// -----------------------------------------------------------------
async function iniciarCheckout(event) {
  if (event) event.preventDefault();
  const carrito = obtenerCarrito();
  if (carrito.length === 0) {
    mostrarToast('Tu carrito está vacío.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-pago');
  if (btn) { btn.disabled = true; btn.innerText = 'Conectando con Mercado Pago...'; }

  const cliente = {
    nombre: document.getElementById('checkout-nombre')?.value || '',
    rut: document.getElementById('checkout-rut')?.value || '',
    telefono: document.getElementById('checkout-telefono')?.value || '',
    email: document.getElementById('checkout-email')?.value || '',
    tipo_entrega: document.getElementById('checkout-entrega')?.value || 'Retiro en tienda',
    direccion: document.getElementById('checkout-direccion')?.value || ''
  };

  try {
    const json = await llamarBackend('iniciarPagoMercadoPago', {
      items: carrito.map(i => ({ sku: i.sku, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad })),
      cliente
    });

    // Mercado Pago (Checkout Pro) solo necesita redirigir el navegador a la
    // URL que entrega la preferencia de pago; no requiere armar un formulario.
    localStorage.removeItem(CLAVE_CARRITO); // el pedido ya quedó registrado como "Pendiente" en el backend
    window.location.href = json.url;
  } catch (err) {
    alert('No se pudo iniciar el pago: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerText = 'Pagar con Mercado Pago'; }
  }
}

// -----------------------------------------------------------------
// AGENDA PÚBLICA (reserva de horas)
// -----------------------------------------------------------------
let horaSeleccionadaPublica = null;

// Genera los bloques horarios según el día de la semana, igual que en el
// panel interno: Lunes a Viernes 09:00-13:30 y 15:00-17:30, Sábado
// 09:00-13:30, Domingo cerrado.
function generarHorasJornadaPublica(fechaStr) {
  const partes = fechaStr.split('-').map(Number);
  const fechaObj = new Date(partes[0], partes[1] - 1, partes[2]);
  const diaSemana = fechaObj.getDay(); // 0=domingo ... 6=sábado

  const bloquesManana = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
  const bloquesTarde = ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];

  if (diaSemana === 0) return []; // domingo: cerrado
  if (diaSemana === 6) return bloquesManana; // sábado: solo mañana
  return bloquesManana.concat(bloquesTarde); // lunes a viernes
}

async function cargarHorariosPublicos() {
  const inputFecha = document.getElementById('agenda-fecha-publica');
  const grid = document.getElementById('horarios-grid-publico');
  if (!inputFecha || !grid) return;

  const fecha = inputFecha.value;
  if (!fecha) return;

  grid.innerHTML = '<p>Cargando horarios...</p>';
  horaSeleccionadaPublica = null;
  actualizarResumenHoraSeleccionada();

  const horas = generarHorasJornadaPublica(fecha);
  if (horas.length === 0) {
    grid.innerHTML = '<p>🚫 Cerrado este día (domingo). Elige otra fecha.</p>';
    return;
  }

  try {
    const json = await llamarBackend('obtenerAgendaPublicaDia', { fecha });
    const ocupados = json.ocupados || [];

    const hoy = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toTimeString().substring(0, 5);

    grid.innerHTML = horas.map(hora => {
      const ocupado = ocupados.includes(hora);
      const pasado = (fecha === hoy && hora < horaActual);
      if (ocupado || pasado) {
        return `<div class="bloque-hora-publico ocupado">${hora}</div>`;
      }
      return `<div class="bloque-hora-publico disponible" onclick="seleccionarHoraPublica('${hora}', this)">${hora}</div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<p class="aviso aviso-error">${err.message}</p>`;
  }
}

function seleccionarHoraPublica(hora, elemento) {
  document.querySelectorAll('.bloque-hora-publico.seleccionado').forEach(el => el.classList.remove('seleccionado'));
  elemento.classList.add('seleccionado');
  horaSeleccionadaPublica = hora;
  actualizarResumenHoraSeleccionada();
}

function actualizarResumenHoraSeleccionada() {
  const resumen = document.getElementById('resumen-hora-seleccionada');
  const btn = document.getElementById('btn-confirmar-reserva');
  if (resumen) {
    resumen.innerText = horaSeleccionadaPublica
      ? `Hora seleccionada: ${horaSeleccionadaPublica}`
      : 'Elige un horario disponible arriba ⬆️';
  }
  if (btn) btn.disabled = !horaSeleccionadaPublica;
}

async function confirmarReservaPublica(event) {
  if (event) event.preventDefault();
  const fecha = document.getElementById('agenda-fecha-publica').value;
  if (!fecha || !horaSeleccionadaPublica) {
    mostrarToast('Elige una fecha y un horario disponible.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-reserva');
  if (btn) { btn.disabled = true; btn.innerText = 'Reservando...'; }

  const payload = {
    fecha: `${fecha} ${horaSeleccionadaPublica}`,
    nombre_tutor: document.getElementById('reserva-nombre').value,
    rut: document.getElementById('reserva-rut').value,
    telefono: document.getElementById('reserva-telefono').value,
    mascota: document.getElementById('reserva-mascota').value,
    raza: document.getElementById('reserva-raza').value,
    servicio: document.getElementById('reserva-servicio').value
  };

  try {
    const json = await llamarBackend('reservarCitaPublica', payload);
    document.getElementById('formulario-reserva').classList.add('oculto');
    document.getElementById('confirmacion-reserva').classList.remove('oculto');
    document.getElementById('mensaje-confirmacion-reserva').innerText = json.message;
  } catch (err) {
    alert('No se pudo reservar: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerText = 'Confirmar reserva'; }
    cargarHorariosPublicos(); // refresca por si el horario ya no está disponible
  }
}

// -----------------------------------------------------------------
// INICIALIZACIÓN COMÚN
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  inicializarNavMovil();
  actualizarBadgeCarrito();

  const btnAbrirCarrito = document.getElementById('btn-abrir-carrito');
  if (btnAbrirCarrito) btnAbrirCarrito.addEventListener('click', abrirPanelCarrito);

  const overlay = document.getElementById('overlay-carrito');
  if (overlay) overlay.addEventListener('click', cerrarPanelCarrito);

  const btnCerrarCarrito = document.getElementById('btn-cerrar-carrito');
  if (btnCerrarCarrito) btnCerrarCarrito.addEventListener('click', cerrarPanelCarrito);

  // Página tienda.html
  if (document.getElementById('grid-productos-publico')) {
    cargarCatalogoPublico();
    const inputBuscar = document.getElementById('buscar-producto-publico');
    if (inputBuscar) inputBuscar.addEventListener('input', renderizarCatalogo);
  }

  // Página de checkout (dentro de tienda.html o carrito)
  const formCheckout = document.getElementById('form-checkout');
  if (formCheckout) formCheckout.addEventListener('submit', iniciarCheckout);

  // Página agenda.html
  const inputFechaAgenda = document.getElementById('agenda-fecha-publica');
  if (inputFechaAgenda) {
    const hoy = new Date().toISOString().split('T')[0];
    inputFechaAgenda.min = hoy;
    inputFechaAgenda.value = hoy;
    inputFechaAgenda.addEventListener('change', cargarHorariosPublicos);
    cargarHorariosPublicos();
  }

  const formReserva = document.getElementById('formulario-reserva');
  if (formReserva) formReserva.addEventListener('submit', confirmarReservaPublica);

  const inputRutReserva = document.getElementById('reserva-rut');
  if (inputRutReserva) inputRutReserva.addEventListener('blur', () => formatearInputRut(inputRutReserva));

  const inputRutCheckout = document.getElementById('checkout-rut');
  if (inputRutCheckout) inputRutCheckout.addEventListener('blur', () => formatearInputRut(inputRutCheckout));
});