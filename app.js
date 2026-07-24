// =================================================================
// FRONTEND APP.JS - MANADA PATITAS PWA (INTEGRADO COMPLETO + POS + INVENTARIO)
// =================================================================

const URL_WEB_APP = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec"; 

const CONFIG_ROLES = {
  admin: { nombre: "Administrador / Dirección", pin: "1234", pestanaDefault: "agenda" },
  veterinaria: { nombre: "Médico Veterinario", pin: "2026", pestanaDefault: "agenda" },
  peluqueria: { nombre: "Estética y Peluquería", pin: "1000", pestanaDefault: "peluqueria" },
  caja: { nombre: "Ventas y Recepción", pin: "2173", pestanaDefault: "agenda" }
};

let usuarioActual = null;
let listaPacientesGlobal = [];
let listaCitasGlobal = [];
let listaClinicaGlobal = [];
let listaPeluqueriaGlobal = [];
let listaInventarioGlobal = [];
let carritoPOS = [];

document.addEventListener('DOMContentLoaded', () => {
  inicializarAutenticacion();
  configurarFechaPorDefecto();
  mostrarModalLogin();
});

// -----------------------------------------------------------------
// AUTENTICACIÓN Y ROLES
// -----------------------------------------------------------------
function inicializarAutenticacion() {
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.onsubmit = (e) => {
      e.preventDefault();
      procesarLogin();
      return false;
    };
  }
}

function procesarLogin() {
  const inputPin = document.getElementById('login-pin');
  const selectRol = document.getElementById('login-rol');

  const pinIngresado = inputPin ? inputPin.value.trim() : "";
  const rolClave = selectRol ? selectRol.value : "admin";
  const rolInfo = CONFIG_ROLES[rolClave] || { pin: "1234", nombre: "Usuario", pestanaDefault: "agenda" };

  if (pinIngresado === rolInfo.pin) {
    usuarioActual = { rol: rolClave, nombre: rolInfo.nombre };
    
    const badgeRol = document.getElementById('usuario-badge');
    if (badgeRol) badgeRol.innerText = usuarioActual.nombre;

    document.body.className = `autenticado rol-${rolClave}`;
    
    cerrarModalLogin();
    if (inputPin) inputPin.value = '';
    
    cargarDatosBackend().then(() => {
      cambiarPestana(rolInfo.pestanaDefault);
    });
  } else {
    alert("⚠️ PIN incorrecto. Revisa el PIN e intenta nuevamente.");
    if (inputPin) {
      inputPin.value = '';
      inputPin.focus();
    }
  }
}

function cerrarModalLogin() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.style.display = 'none';
}

function mostrarModalLogin() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.style.display = 'flex';
  document.body.className = '';
}

function cerrarSesion() {
  usuarioActual = null;
  const badgeRol = document.getElementById('usuario-badge');
  if (badgeRol) badgeRol.innerText = "Invitado";
  mostrarModalLogin();
}

function cambiarPinAcceso() {
  const nuevoPin = prompt("Ingresa tu nuevo PIN de acceso:");
  if (nuevoPin && usuarioActual) {
    CONFIG_ROLES[usuarioActual.rol].pin = nuevoPin.trim();
    alert("✅ PIN actualizado con éxito para esta sesión.");
  }
}

// -----------------------------------------------------------------
// NAVEGACIÓN
// -----------------------------------------------------------------
function cambiarPestana(idPestana) {
  if (!usuarioActual) {
    mostrarModalLogin();
    return;
  }

  const secciones = document.querySelectorAll('.tab-content');
  secciones.forEach(sec => {
    sec.classList.add('hidden');
    sec.classList.remove('active');
  });

  const botones = document.querySelectorAll('.tab-btn');
  botones.forEach(btn => btn.classList.remove('active'));

  const seccionObjetivo = document.getElementById(`sec-${idPestana}`);
  const botonObjetivo = document.getElementById(`nav-btn-${idPestana}`);

  if (seccionObjetivo) {
    seccionObjetivo.classList.remove('hidden');
    seccionObjetivo.classList.add('active');
  }

  if (botonObjetivo) {
    botonObjetivo.classList.add('active');
  }

  if (idPestana === 'agenda') {
    renderizarParrillaAgenda();
  } else if (idPestana === 'inventario') {
    renderizarTablaInventario();
  } else if (idPestana === 'caja') {
    renderizarPOS();
  }
}

function configurarFechaPorDefecto() {
  const hoy = new Date().toISOString().split('T')[0];
  const inputFiltro = document.getElementById('filtro-fecha-agenda');
  if (inputFiltro) inputFiltro.value = hoy;
}

// -----------------------------------------------------------------
// BACKEND GOOGLE SHEETS
// -----------------------------------------------------------------
async function cargarDatosBackend() {
  try {
    const res = await fetch(URL_WEB_APP, {
      method: 'POST',
      body: JSON.stringify({ accion: "obtenerTodo" })
    });
    const textoRespuesta = await res.text();
    let data;
    try {
      data = JSON.parse(textoRespuesta);
    } catch (e) {
      console.error("Respuesta no válida del servidor:", textoRespuesta);
      return;
    }

    listaPacientesGlobal = data.tutores || data.pacientes || [];
    listaCitasGlobal = data.agenda || data.citas || [];
    listaClinicaGlobal = data.clinica || [];
    listaPeluqueriaGlobal = data.peluqueria || [];
    listaInventarioGlobal = data.inventario || [];

    poblarCombosTutores();
    renderizarParrillaAgenda();
    renderizarTablaInventario();
    renderizarPOS();
  } catch (err) {
    console.error("Error cargando datos del backend:", err);
  }
}

async function enviarFormularioBackend(action, payload) {
  const bodyData = { accion: action, ...payload };
  const res = await fetch(URL_WEB_APP, {
    method: 'POST',
    body: JSON.stringify(bodyData)
  });
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  return json;
}

function formatearRutChile(rutRaw) {
  if (!rutRaw) return '';
  let str = rutRaw.toString().replace(/[^0-9kK]/g, '').toUpperCase();
  if (str.length <= 1) return str;
  return str.slice(0, -1) + '-' + str.slice(-1);
}

function limpiarRutStr(rutStr) {
  if (!rutStr) return '';
  return rutStr.toString().replace(/[^0-9kK]/g, '').toUpperCase();
}

function formatearInputRut(input) {
  if (input) input.value = formatearRutChile(input.value);
}

// -----------------------------------------------------------------
// COMBOS DE TUTORES EN TODAS LAS SECCIONES
// -----------------------------------------------------------------
function poblarCombosTutores() {
  const selectsTutor = [
    document.getElementById('age-select-tutor'),
    document.getElementById('cli-select-tutor'),
    document.getElementById('pel-select-tutor')
  ];

  const tutoresMap = new Map();
  listaPacientesGlobal.forEach(p => {
    const r = formatearRutChile(p.rut || p.RUT);
    const n = p.nombre || p.Nombre || p.tutor || 'Sin Nombre';
    if (r && !tutoresMap.has(r)) tutoresMap.set(r, n);
  });

  selectsTutor.forEach(select => {
    if (!select) return;
    const valPrevio = select.value;
    select.innerHTML = '<option value="">-- Selecciona un Tutor --</option>';
    tutoresMap.forEach((nombre, rut) => {
      select.innerHTML += `<option value="${rut}">${nombre} (${rut})</option>`;
    });
    select.value = valPrevio;
  });
}

// -----------------------------------------------------------------
// AGENDA
// -----------------------------------------------------------------
function actualizarMascotasAgenda() {
  const rutSeleccionado = document.getElementById('age-select-tutor').value;
  const selectMascota = document.getElementById('age-select-mascota');
  if (!selectMascota) return;

  if (!rutSeleccionado) {
    selectMascota.innerHTML = '<option value="">-- Selecciona primero un Tutor --</option>';
    selectMascota.disabled = true;
    return;
  }

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut || p.RUT) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || p.Mascota || 'Mascota';
    selectMascota.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  selectMascota.disabled = false;
}

function normalizarFechaHoraCita(rawStr) {
  if (!rawStr) return "";
  if (rawStr instanceof Date) {
    const yyyy = rawStr.getFullYear();
    const mm = String(rawStr.getMonth() + 1).padStart(2, '0');
    const dd = String(rawStr.getDate()).padStart(2, '0');
    const hh = String(rawStr.getHours()).padStart(2, '0');
    const min = String(rawStr.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }
  let s = rawStr.toString().trim();
  if (s.includes('T')) {
    const partes = s.split('T');
    const fecha = partes[0];
    const hora = partes[1] ? partes[1].substring(0, 5) : "00:00";
    return `${fecha} ${hora}`;
  }
  return s.substring(0, 16);
}

function renderizarParrillaAgenda() {
  const contenedor = document.getElementById('grid-horarios');
  const fechaSeleccionada = document.getElementById('filtro-fecha-agenda') ? document.getElementById('filtro-fecha-agenda').value : '';
  if (!contenedor || !fechaSeleccionada) return;

  contenedor.innerHTML = '';
  const horasJornada = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];

  const ahora = new Date();
  const fechaHoyStr = ahora.toISOString().split('T')[0];
  const horaActualStr = ahora.toTimeString().substring(0, 5);

  horasJornada.forEach(hora => {
    const claveBloque = `${fechaSeleccionada} ${hora}`;
    const cita = listaCitasGlobal.find(c => {
      const rawFechaCita = c.fecha_hora || c.Fecha_Hora || c.fecha || c.Fecha || '';
      return normalizarFechaHoraCita(rawFechaCita) === claveBloque;
    });

    const div = document.createElement('div');
    const esPasado = (fechaSeleccionada === fechaHoyStr && hora < horaActualStr);

    if (cita) {
      div.className = 'bloque-hora ocupado';
      const nomMascota = cita.mascota || cita.Mascota || 'Reservado';
      const nomServicio = cita.servicio || cita.Servicio || 'Atención';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita"><strong>🐾 ${nomMascota}</strong><br><small>${nomServicio}</small></div>`;
    } else if (esPasado) {
      div.className = 'bloque-hora pasado';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita">⛔ Pasado</div>`;
    } else {
      div.className = 'bloque-hora disponible';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita">🟢 Disponible</div><button class="btn-agendar-mini" style="margin-top: 5px; font-size: 0.75rem; padding: 2px 6px;">+ Agendar</button>`;
      div.onclick = () => seleccionarHorarioDisponible(fechaSeleccionada, hora);
    }
    contenedor.appendChild(div);
  });
}

function seleccionarHorarioDisponible(fecha, hora) {
  const datetimeInput = document.getElementById('agenda-fecha');
  if (datetimeInput) {
    datetimeInput.value = `${fecha} ${hora}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function guardarCita(e) {
  if (e) e.preventDefault();
  const selectTutor = document.getElementById('age-select-tutor');
  const selectMascota = document.getElementById('age-select-mascota');
  const fechaInput = document.getElementById('agenda-fecha').value;

  if (!selectTutor.value || !selectMascota.value || !fechaInput) {
    alert("Por favor completa los datos de la cita y elige un horario.");
    return;
  }

  const payload = {
    fecha: fechaInput,
    mascota: selectMascota.value,
    tutor: selectTutor.options[selectTutor.selectedIndex].text,
    servicio: document.getElementById('agenda-servicio').value
  };

  try {
    const json = await enviarFormularioBackend('guardarCita', payload);
    alert('📅 ' + json.message);
    document.getElementById('form-agenda').reset();
    actualizarMascotasAgenda();
    await cargarDatosBackend();
  } catch (err) {
    alert('⚠️ No se pudo reservar: ' + err.message);
  }
}

// -----------------------------------------------------------------
// TUTORES
// -----------------------------------------------------------------
async function guardarTutor(e) {
  if (e) e.preventDefault();
  const payload = {
    rut: document.getElementById('tut-rut').value,
    nombre: document.getElementById('tut-nombre').value,
    telefono: document.getElementById('tut-telefono').value,
    mascota: document.getElementById('tut-mascota').value,
    raza: document.getElementById('tut-raza').value,
    edad: document.getElementById('tut-edad').value,
    peso: document.getElementById('tut-peso').value
  };

  try {
    await enviarFormularioBackend('guardarTutor', payload);
    alert('🐾 Paciente y Tutor guardados con éxito.');
    document.getElementById('form-tutor').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al guardar tutor: ' + err.message);
  }
}

// -----------------------------------------------------------------
// CONSULTA CLÍNICA
// -----------------------------------------------------------------
function actualizarMascotasClinica() {
  const rutSeleccionado = document.getElementById('cli-select-tutor').value;
  const selectMascota = document.getElementById('cli-select-mascota');
  if (!selectMascota) return;

  if (!rutSeleccionado) {
    selectMascota.innerHTML = '<option value="">-- Selecciona primero un Tutor --</option>';
    selectMascota.disabled = true;
    return;
  }

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut || p.RUT) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || p.Mascota || 'Mascota';
    selectMascota.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  selectMascota.disabled = false;
}

function cargarDatosMascotaSeleccionada() {
  const rutSeleccionado = document.getElementById('cli-select-tutor').value;
  const mascotaNombre = document.getElementById('cli-select-mascota').value;
  const banner = document.getElementById('cli-info-paciente');

  if (!rutSeleccionado || !mascotaNombre) {
    if (banner) banner.classList.add('hidden');
    return;
  }

  const registro = listaPacientesGlobal.find(p => 
    formatearRutChile(p.rut || p.RUT) === rutSeleccionado && 
    (p.mascota || p.Mascota || '').toString().trim().toLowerCase() === mascotaNombre.trim().toLowerCase()
  );

  if (registro && banner) {
    document.getElementById('lbl-cli-mascota').innerText = registro.mascota || registro.Mascota || '-';
    document.getElementById('lbl-cli-raza').innerText = registro.raza || registro.Raza || '-';
    document.getElementById('lbl-cli-edad').innerText = registro.edad || registro.Edad || '-';
    banner.classList.remove('hidden');
  }

  renderizarHistorialClinicoPaciente(rutSeleccionado, mascotaNombre);
}

function renderizarHistorialClinicoPaciente(rutTutor, nombreMascota) {
  const contenedor = document.getElementById('contenedor-historial-clinico');
  if (!contenedor) return;

  contenedor.innerHTML = '';
  const rutLimpioSeleccionado = limpiarRutStr(rutTutor);

  const atencionesMascota = listaClinicaGlobal.filter(c => {
    const rawRutC = c.Rut_Tutor || c.rut_tutor || c.RUT_Tutor || '';
    const rutCLLimpio = limpiarRutStr(rawRutC);
    const mascotaC = (c.Mascota || c.mascota || '').toString().trim().toLowerCase();
    return (rutCLLimpio.includes(rutLimpioSeleccionado) || rutLimpioSeleccionado.includes(rutCLLimpio)) && mascotaC === nombreMascota.trim().toLowerCase();
  });

  if (atencionesMascota.length === 0) {
    contenedor.innerHTML = '<p style="color:#777;">Este paciente no registra consultas médicas anteriores.</p>';
    return;
  }

  [...atencionesMascota].reverse().forEach(c => {
    const card = document.createElement('div');
    card.className = 'card-historial';
    card.innerHTML = `
      <div style="font-size:0.85rem; color:#666;">📅 ${c.Fecha || c.fecha || '-'} | 🐾 <strong>${c.Mascota || c.mascota || nombreMascota}</strong></div>
      <div><strong>🌡️ Temp:</strong> ${c.Temperatura || c.temperatura || '-'} °C | <strong>⚖️ Peso:</strong> ${c.Peso || c.peso || '-'} kg</div>
      <div><strong>🩺 Diagnóstico:</strong> ${c.Diagnostico || c.diagnostico || '-'}</div>
      <div><strong>💊 Tratamiento / Receta:</strong> ${c.Receta || c.receta || '-'}</div>
    `;
    contenedor.appendChild(card);
  });
}

async function guardarAtencionClinica(e) {
  if (e) e.preventDefault();
  const selectTutor = document.getElementById('cli-select-tutor');
  const selectMascota = document.getElementById('cli-select-mascota');

  if (!selectTutor.value || !selectMascota.value) {
    alert("Debes seleccionar un tutor y una mascota antes de guardar la ficha.");
    return;
  }

  const payload = {
    rut_tutor: selectTutor.value,
    nombre_tutor: selectTutor.options[selectTutor.selectedIndex].text,
    mascota: selectMascota.value,
    temperatura: document.getElementById('cli-temp').value,
    peso: document.getElementById('cli-peso').value,
    diagnostico: document.getElementById('cli-diagnostico').value,
    receta: document.getElementById('cli-receta').value
  };

  try {
    await enviarFormularioBackend('guardarAtencionClinica', payload);
    alert('🩺 Consulta clínica registrada con éxito.');
    document.getElementById('form-clinica').reset();
    document.getElementById('cli-info-paciente').classList.add('hidden');
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al guardar atención: ' + err);
  }
}

// -----------------------------------------------------------------
// PELUQUERÍA
// -----------------------------------------------------------------
function actualizarMascotasPeluqueria() {
  const rutSeleccionado = document.getElementById('pel-select-tutor').value;
  const selectMascota = document.getElementById('pel-select-mascota');
  if (!selectMascota) return;

  if (!rutSeleccionado) {
    selectMascota.innerHTML = '<option value="">-- Selecciona primero un Tutor --</option>';
    selectMascota.disabled = true;
    return;
  }

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut || p.RUT) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || p.Mascota || 'Mascota';
    selectMascota.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  selectMascota.disabled = false;
}

async function guardarPeluqueria(e) {
  if (e) e.preventDefault();
  const selectTutor = document.getElementById('pel-select-tutor');
  const selectMascota = document.getElementById('pel-select-mascota');

  const payload = {
    rut_tutor: selectTutor.value,
    tutor: selectTutor.options[selectTutor.selectedIndex].text,
    mascota: selectMascota.value,
    servicio: document.getElementById('pel-servicio').value,
    monto: document.getElementById('pel-monto').value,
    observaciones: document.getElementById('pel-obs').value
  };

  try {
    await enviarFormularioBackend('guardarPeluqueria', payload);
    alert('✂️ Servicio de Peluquería registrado.');
    document.getElementById('form-peluqueria').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error guardando registro: ' + err);
  }
}

// -----------------------------------------------------------------
// INVENTARIO
// -----------------------------------------------------------------
function renderizarTablaInventario() {
  const tbody = document.getElementById('tabla-inventario-body');
  if (!tbody) return;

  if (listaInventarioGlobal.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#777;">No hay productos registrados en el inventario.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  listaInventarioGlobal.forEach(p => {
    const tr = document.createElement('tr');
    const codigo = p.codigo || p.Codigo || p.sku || '-';
    const nombre = p.nombre || p.Nombre || p.producto || '-';
    const categoria = p.categoria || p.Categoria || 'General';
    const precio = Number(p.precio || p.Precio || 0).toLocaleString('es-CL');
    const stock = p.stock || p.Stock || 0;

    tr.innerHTML = `
      <td><code>${codigo}</code></td>
      <td><strong>${nombre}</strong></td>
      <td><span class="badge-cat">${categoria}</span></td>
      <td>$${precio}</td>
      <td><strong style="color: ${stock <= 3 ? '#e74c3c' : '#2e7d32'}">${stock} u.</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

async function guardarProducto(e) {
  if (e) e.preventDefault();
  const payload = {
    codigo: document.getElementById('inv-codigo').value,
    nombre: document.getElementById('inv-nombre').value,
    categoria: document.getElementById('inv-categoria').value,
    precio: document.getElementById('inv-precio').value,
    stock: document.getElementById('inv-stock').value
  };

  try {
    await enviarFormularioBackend('guardarProducto', payload);
    alert('📦 Producto actualizado correctamente.');
    document.getElementById('form-inventario').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al guardar producto: ' + err.message);
  }
}

// -----------------------------------------------------------------
// POS / CAJA DE VENTAS
// -----------------------------------------------------------------
function renderizarPOS() {
  filtrarProductosPOS();
  renderizarCarritoPOS();
}

function filtrarProductosPOS() {
  const contenedor = document.getElementById('pos-grid-productos');
  const buscarInput = document.getElementById('pos-buscar');
  if (!contenedor) return;

  const termino = buscarInput ? buscarInput.value.toLowerCase().trim() : "";
  contenedor.innerHTML = '';

  const productosFiltrados = listaInventarioGlobal.filter(p => {
    const nom = (p.nombre || p.Nombre || '').toLowerCase();
    const cod = (p.codigo || p.Codigo || '').toLowerCase();
    return nom.includes(termino) || cod.includes(termino);
  });

  if (productosFiltrados.length === 0) {
    contenedor.innerHTML = '<p style="color:#777; grid-column: 1/-1;">No se encontraron productos.</p>';
    return;
  }

  productosFiltrados.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pos-card-item';
    const nombre = p.nombre || p.Nombre || 'Producto';
    const precio = Number(p.precio || p.Precio || 0);
    const stock = Number(p.stock || p.Stock || 0);
    const codigo = p.codigo || p.Codigo || '';

    card.innerHTML = `
      <div class="pos-item-title">${nombre}</div>
      <div class="pos-item-price">$${precio.toLocaleString('es-CL')}</div>
      <div class="pos-item-stock">Stock: ${stock}</div>
    `;

    card.onclick = () => agregarAlCarrito(codigo, nombre, precio, stock);
    contenedor.appendChild(card);
  });
}

function agregarAlCarrito(codigo, nombre, precio, stockMax) {
  const existe = carritoPOS.find(item => item.codigo === codigo);

  if (existe) {
    if (existe.cantidad < stockMax) {
      existe.cantidad++;
    } else {
      alert("⚠️ Has alcanzado el límite del stock disponible para este producto.");
    }
  } else {
    if (stockMax > 0) {
      carritoPOS.push({ codigo, nombre, precio, cantidad: 1, stockMax });
    } else {
      alert("⚠️ Sin stock disponible para realizar la venta.");
    }
  }
  renderizarCarritoPOS();
}

function renderizarCarritoPOS() {
  const contenedor = document.getElementById('pos-items-carrito');
  const totalElem = document.getElementById('pos-total-monto');
  if (!contenedor) return;

  if (carritoPOS.length === 0) {
    contenedor.innerHTML = '<p style="color: #777; text-align: center; margin-top: 20px;">El carrito está vacío</p>';
    if (totalElem) totalElem.innerText = '$0';
    return;
  }

  contenedor.innerHTML = '';
  let totalCalculado = 0;

  carritoPOS.forEach((item, index) => {
    const subtotal = item.precio * item.cantidad;
    totalCalculado += subtotal;

    const row = document.createElement('div');
    row.className = 'cart-item-row';
    row.innerHTML = `
      <div style="flex:1;">
        <strong>${item.nombre}</strong><br>
        <small>$${item.precio.toLocaleString('es-CL')} c/u</small>
      </div>
      <div style="display:flex; align-items:center; gap:5px;">
        <button onclick="modificarCantidadCarrito(${index}, -1)">-</button>
        <span>${item.cantidad}</span>
        <button onclick="modificarCantidadCarrito(${index}, 1)">+</button>
      </div>
      <div style="font-weight:bold; width:80px; text-align:right;">
        $${subtotal.toLocaleString('es-CL')}
      </div>
    `;
    contenedor.appendChild(row);
  });

  if (totalElem) totalElem.innerText = `$${totalCalculado.toLocaleString('es-CL')}`;
}

function modificarCantidadCarrito(index, cambio) {
  const item = carritoPOS[index];
  if (!item) return;

  item.cantidad += cambio;
  if (item.cantidad > item.stockMax) {
    alert("⚠️ No hay más stock disponible.");
    item.cantidad = item.stockMax;
  }

  if (item.cantidad <= 0) {
    carritoPOS.splice(index, 1);
  }
  renderizarCarritoPOS();
}

async function procesarVentaPOS() {
  if (carritoPOS.length === 0) {
    alert("El carrito está vacío. Agrega productos antes de cobrarlos.");
    return;
  }

  const metodoPago = document.getElementById('pos-metodo-pago').value;
  const totalCalculado = carritoPOS.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);

  const payload = {
    metodo_pago: metodoPago,
    total: totalCalculado,
    items: carritoPOS
  };

  try {
    await enviarFormularioBackend('guardarVenta', payload);
    alert(`💳 Venta procesada con éxito por $${totalCalculado.toLocaleString('es-CL')} (${metodoPago}).`);
    carritoPOS = [];
    renderizarCarritoPOS();
    await cargarDatosBackend();
  } catch (err) {
    alert("Error al procesar la venta: " + err.message);
  }
}
