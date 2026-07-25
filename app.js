// =================================================================
// FRONTEND APP.JS - MANADA PATITAS PWA
// =================================================================

const URL_WEB_APP = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec";

// Los PIN YA NO viven aquí. El PIN se valida en el backend contra la
// hoja "Usuarios" de Google Sheets. Aquí solo dejamos, por rol, a qué
// pestaña se debe entrar por defecto tras iniciar sesión.
const CONFIG_ROLES = {
  admin:       { pestanaDefault: "agenda" },
  veterinaria: { pestanaDefault: "agenda" },
  peluqueria:  { pestanaDefault: "peluqueria" },
  caja:        { pestanaDefault: "agenda" }
};

let usuarioActual = null;
let sessionToken = null;

let listaPacientesGlobal = [];
let listaCitasGlobal = [];
let listaClinicaGlobal = [];
let listaPeluqueriaGlobal = [];
let listaInventarioGlobal = [];
let carritoPOS = [];

// Estado temporal del modal de detalle de producto (POS)
let productoSeleccionadoPOS = null;
let cantidadSeleccionadaPOS = 1;

// Instancia activa del lector de cámara (html5-qrcode)
let html5QrCodeInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  inicializarAutenticacion();
  configurarFechaPorDefecto();
  configurarEventosDesgloseIVA();
  configurarEventosPOS();
  mostrarModalLogin();
});

// -----------------------------------------------------------------
// AUTENTICACIÓN
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

async function procesarLogin() {
  const inputPin = document.getElementById('login-pin');
  const selectRol = document.getElementById('login-rol');
  const btnSubmit = document.querySelector('#form-login button[type="submit"]');

  const pinIngresado = inputPin ? inputPin.value.trim() : "";
  const rolClave = selectRol ? selectRol.value : "admin";

  if (!pinIngresado) return;

  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerText = "Verificando..."; }

  try {
    const res = await fetch(URL_WEB_APP, {
      method: 'POST',
      body: JSON.stringify({ accion: "login", rol: rolClave, pin: pinIngresado })
    });
    const texto = await res.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      alert("El servidor no respondió correctamente. Verifica el despliegue del script.");
      return;
    }

    if (json.status === "success") {
      sessionToken = json.token;
      usuarioActual = { rol: json.rol, nombre: json.nombre };

      const badgeRol = document.getElementById('usuario-badge');
      if (badgeRol) badgeRol.innerText = usuarioActual.nombre;

      document.body.className = `autenticado rol-${json.rol}`;

      cerrarModalLogin();
      if (inputPin) inputPin.value = '';

      const pestanaDefault = (CONFIG_ROLES[json.rol] && CONFIG_ROLES[json.rol].pestanaDefault) || 'agenda';
      await cargarDatosBackend();
      cambiarPestana(pestanaDefault);
    } else {
      alert("⚠️ " + (json.message || "PIN incorrecto."));
      if (inputPin) {
        inputPin.value = '';
        inputPin.focus();
      }
    }
  } catch (err) {
    alert("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    console.error(err);
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerText = "Ingresar al Sistema"; }
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
  sessionToken = null;
  const badgeRol = document.getElementById('usuario-badge');
  if (badgeRol) badgeRol.innerText = "Invitado";
  mostrarModalLogin();
}

async function cambiarPinAcceso() {
  if (!usuarioActual || !sessionToken) return;

  const pinActual = prompt("Ingresa tu PIN actual:");
  if (!pinActual) return;

  const pinNuevo = prompt("Ingresa tu nuevo PIN (mínimo 4 dígitos):");
  if (!pinNuevo) return;

  try {
    const json = await enviarFormularioBackend('cambiarPin', {
      pin_actual: pinActual.trim(),
      pin_nuevo: pinNuevo.trim()
    });
    alert('✅ ' + json.message);
  } catch (err) {
    alert('Error: ' + err.message);
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
// BACKEND
// -----------------------------------------------------------------
async function cargarDatosBackend() {
  try {
    const res = await fetch(URL_WEB_APP, {
      method: 'POST',
      body: JSON.stringify({ accion: "obtenerTodo", token: sessionToken })
    });
    const textoRespuesta = await res.text();
    let data;
    try {
      data = JSON.parse(textoRespuesta);
    } catch (e) {
      console.error("Respuesta no válida:", textoRespuesta);
      alert("El servidor no respondió correctamente. Revisa el despliegue del script de Google.");
      return;
    }

    if (data.status === "error") {
      if (data.codigo === "SESION_EXPIRADA") {
        alert("⚠️ Tu sesión expiró. Vuelve a iniciar sesión.");
        cerrarSesion();
      } else {
        console.error("Error del backend:", data.message);
      }
      return;
    }

    listaPacientesGlobal = data.tutores || [];
    listaCitasGlobal = data.agenda || [];
    listaClinicaGlobal = data.clinica || [];
    listaPeluqueriaGlobal = data.peluqueria || [];
    listaInventarioGlobal = data.inventario || [];

    poblarCombosTutores();
    renderizarParrillaAgenda();
    renderizarTablaInventario();
    renderizarPOS();
  } catch (err) {
    console.error("Error cargando datos:", err);
    alert("No se pudo cargar la información. Revisa tu conexión a internet.");
  }
}

async function enviarFormularioBackend(action, payload) {
  const bodyData = { accion: action, token: sessionToken, ...payload };
  const res = await fetch(URL_WEB_APP, {
    method: 'POST',
    body: JSON.stringify(bodyData)
  });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error("El servidor no respondió correctamente. Revisa el despliegue del script.");
  }

  if (json.status === "error") {
    if (json.codigo === "SESION_EXPIRADA") {
      alert("⚠️ Tu sesión expiró. Vuelve a iniciar sesión.");
      cerrarSesion();
    }
    throw new Error(json.message);
  }
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
// TUTORES COMBO
// -----------------------------------------------------------------
function poblarCombosTutores() {
  const selectsTutor = [
    document.getElementById('age-select-tutor'),
    document.getElementById('cli-select-tutor'),
    document.getElementById('pel-select-tutor')
  ];

  const tutoresMap = new Map();
  listaPacientesGlobal.forEach(p => {
    const r = formatearRutChile(p.rut);
    const n = p.nombre || p.tutor || 'Sin Nombre';
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

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || 'Mascota';
    selectMascota.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  selectMascota.disabled = false;
}

function normalizarFechaHoraCita(rawStr) {
  if (!rawStr) return "";
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
      const rawFechaCita = c.fecha_hora || c.fecha || '';
      return normalizarFechaHoraCita(rawFechaCita) === claveBloque;
    });

    const div = document.createElement('div');
    const esPasado = (fechaSeleccionada === fechaHoyStr && hora < horaActualStr);

    if (cita) {
      div.className = 'bloque-hora ocupado';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita"><strong>🐾 ${cita.mascota || 'Reservado'}</strong><br><small>${cita.servicio || 'Atención'}</small></div>`;
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
    alert("Completa todos los campos de la cita.");
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
    alert('Error al reservar: ' + err.message);
  }
}

// -----------------------------------------------------------------
// TUTORES Y PACIENTES
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
    const json = await enviarFormularioBackend('guardarTutor', payload);
    alert('🐾 ' + json.message);
    document.getElementById('form-tutor').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error: ' + err.message);
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

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || 'Mascota';
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
    formatearRutChile(p.rut) === rutSeleccionado &&
    (p.mascota || '').toString().trim().toLowerCase() === mascotaNombre.trim().toLowerCase()
  );

  if (registro && banner) {
    document.getElementById('lbl-cli-mascota').innerText = registro.mascota || '-';
    document.getElementById('lbl-cli-raza').innerText = registro.raza || '-';
    document.getElementById('lbl-cli-edad').innerText = registro.edad || '-';
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
    const rawRutC = c.rut_tutor || '';
    const rutCLLimpio = limpiarRutStr(rawRutC);
    const mascotaC = (c.mascota || '').toString().trim().toLowerCase();
    return (rutCLLimpio.includes(rutLimpioSeleccionado) || rutLimpioSeleccionado.includes(rutCLLimpio)) && mascotaC === nombreMascota.trim().toLowerCase();
  });

  if (atencionesMascota.length === 0) {
    contenedor.innerHTML = '<p style="color:#777;">Sin consultas médicas registradas.</p>';
    return;
  }

  [...atencionesMascota].reverse().forEach(c => {
    const card = document.createElement('div');
    card.className = 'card-historial';
    card.innerHTML = `
      <div style="font-size:0.85rem; color:#666;">📅 ${c.fecha || '-'} | 🐾 <strong>${c.mascota || nombreMascota}</strong></div>
      <div><strong>🌡️ Temp:</strong> ${c.temperatura || '-'} °C | <strong>⚖️ Peso:</strong> ${c.peso || '-'} kg</div>
      <div><strong>🩺 Diagnóstico:</strong> ${c.diagnostico || '-'}</div>
      <div><strong>💊 Receta:</strong> ${c.receta || '-'}</div>
    `;
    contenedor.appendChild(card);
  });
}

async function guardarAtencionClinica(e) {
  if (e) e.preventDefault();
  const selectTutor = document.getElementById('cli-select-tutor');
  const selectMascota = document.getElementById('cli-select-mascota');

  if (!selectTutor.value || !selectMascota.value) {
    alert("Selecciona tutor y mascota.");
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
    alert('🩺 Consulta registrada.');
    document.getElementById('form-clinica').reset();
    document.getElementById('cli-info-paciente').classList.add('hidden');
    await cargarDatosBackend();
  } catch (err) {
    alert('Error: ' + err.message);
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

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || 'Mascota';
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
    alert('✂️ Registro guardado.');
    document.getElementById('form-peluqueria').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// -----------------------------------------------------------------
// INVENTARIO - CÁLCULO DE VALOR NETO, IVA (19%) Y PRECIO BRUTO
// El campo "Precio Venta Final" es de SOLO LECTURA: siempre se
// calcula desde Costo + Margen, nunca se digita a mano.
// -----------------------------------------------------------------
function configurarEventosDesgloseIVA() {
  const inputCosto = document.getElementById('inv-costo');
  const inputMargen = document.getElementById('inv-margen');

  if (inputCosto) inputCosto.addEventListener('input', calcularPrecioVentaSugerido);
  if (inputMargen) inputMargen.addEventListener('input', calcularPrecioVentaSugerido);
}

function calcularPrecioVentaSugerido() {
  const costoNeto = parseFloat(document.getElementById('inv-costo').value) || 0;
  const margenPct = parseFloat(document.getElementById('inv-margen').value) || 0;
  const precioInput = document.getElementById('inv-precio');

  if (costoNeto > 0) {
    // 1. Neto = Costo + Margen %
    const valorVentaNeto = Math.round(costoNeto * (1 + (margenPct / 100)));
    // 2. IVA Chile 19%
    const iva = Math.round(valorVentaNeto * 0.19);
    // 3. Bruto Total (siempre calculado, el campo es de solo lectura)
    const precioFinalBruto = valorVentaNeto + iva;

    if (precioInput) precioInput.value = precioFinalBruto;

    document.getElementById('lbl-inv-neto').innerText = `$${valorVentaNeto.toLocaleString('es-CL')}`;
    document.getElementById('lbl-inv-iva').innerText = `$${iva.toLocaleString('es-CL')}`;
    document.getElementById('lbl-inv-total').innerText = `$${precioFinalBruto.toLocaleString('es-CL')}`;
  } else {
    if (precioInput) precioInput.value = '';
    document.getElementById('lbl-inv-neto').innerText = `$0`;
    document.getElementById('lbl-inv-iva').innerText = `$0`;
    document.getElementById('lbl-inv-total').innerText = `$0`;
  }
}

function renderizarTablaInventario() {
  const tbody = document.getElementById('tabla-inventario-body');
  if (!tbody) return;

  if (listaInventarioGlobal.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#777;">No hay productos en el inventario.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  listaInventarioGlobal.forEach(p => {
    const tr = document.createElement('tr');

    const codigo = p.sku || p.codigo || '-';
    const nombre = p.nombre || '-';
    const categoria = p.categoria || 'General';
    const costo = Number(p.costo || 0).toLocaleString('es-CL');
    const margen = (p.margen_pct !== undefined && p.margen_pct !== null && p.margen_pct !== "") ? p.margen_pct : (p.margen || 0);
    const precioBruto = Number(p.precio_venta || p.precio || 0);
    const stock = (p.stock !== undefined && p.stock !== null) ? p.stock : 0;

    const netoEst = Number(p.valor_neto) || Math.round(precioBruto / 1.19);

    tr.innerHTML = `
      <td><code>${codigo}</code></td>
      <td><strong>${nombre}</strong></td>
      <td><span class="badge-cat">${categoria}</span></td>
      <td>$${costo}</td>
      <td>${margen}%</td>
      <td>
        <strong>$${precioBruto.toLocaleString('es-CL')}</strong><br>
        <small style="color:#666; font-size:0.75rem;">(Neto: $${netoEst.toLocaleString('es-CL')} + IVA)</small>
      </td>
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
    costo: document.getElementById('inv-costo').value,
    margen_pct: document.getElementById('inv-margen').value,
    stock: document.getElementById('inv-stock').value,
    stock_critico: 2
  };

  try {
    const json = await enviarFormularioBackend('guardarProducto', payload);
    alert('📦 ' + json.message);
    document.getElementById('form-inventario').reset();
    document.getElementById('inv-margen').value = "30";
    calcularPrecioVentaSugerido();
    await cargarDatosBackend();
  } catch (err) {
    alert('Error guardando producto: ' + err.message);
  }
}

// -----------------------------------------------------------------
// POS / CAJA
// -----------------------------------------------------------------
function configurarEventosPOS() {
  const inputBuscar = document.getElementById('pos-buscar');
  if (inputBuscar) {
    // Los lectores de código de barras USB/Bluetooth escriben el código y
    // envían un "Enter" automáticamente: lo aprovechamos para buscar
    // coincidencia exacta y mostrar la ficha del producto.
    inputBuscar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarPorCodigoExacto(inputBuscar.value.trim());
      }
    });
  }

  const btnScan = document.getElementById('btn-escanear-camara');
  if (btnScan) btnScan.addEventListener('click', abrirEscanerCamara);

  const btnCerrarEscaner = document.getElementById('btn-cerrar-escaner');
  if (btnCerrarEscaner) btnCerrarEscaner.addEventListener('click', cerrarEscanerCamara);

  const btnCerrarDetalle = document.getElementById('btn-cerrar-detalle');
  if (btnCerrarDetalle) btnCerrarDetalle.addEventListener('click', cerrarDetalleProducto);
}

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

  const productosFiltrados = termino === ""
    ? listaInventarioGlobal
    : listaInventarioGlobal.filter(p => {
        const nom = (p.nombre || '').toLowerCase();
        const cod = (p.sku || p.codigo || '').toString().toLowerCase();
        return nom.includes(termino) || cod.includes(termino);
      });

  if (productosFiltrados.length === 0) {
    contenedor.innerHTML = '<p style="color:#777; grid-column: 1/-1;">No se encontraron productos.</p>';
    return;
  }

  productosFiltrados.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pos-card-item';
    const nombre = p.nombre || 'Producto';
    const precio = Number(p.precio_venta || p.precio || 0);
    const stock = Number(p.stock || 0);
    const codigo = p.sku || p.codigo || '';

    card.innerHTML = `
      <div class="pos-item-title">${nombre}</div>
      <div class="pos-item-price">$${precio.toLocaleString('es-CL')}</div>
      <div class="pos-item-stock">SKU: ${codigo || '-'} · Stock: ${stock} u.</div>
    `;

    // Al hacer clic se abre la ficha del producto (no se agrega directo),
    // para poder ver SKU, neto, IVA, precio y elegir cantidad.
    card.onclick = () => abrirDetalleProducto(codigo);
    contenedor.appendChild(card);
  });
}

// Búsqueda por coincidencia EXACTA de SKU: la usan tanto el lector de
// código de barras (Enter) como el escáner por cámara.
function buscarPorCodigoExacto(codigo) {
  if (!codigo) return;
  const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo || '').toString().trim() === codigo.trim());
  if (producto) {
    abrirDetalleProducto(producto.sku || producto.codigo);
    const inputBuscar = document.getElementById('pos-buscar');
    if (inputBuscar) inputBuscar.value = '';
    filtrarProductosPOS();
  } else {
    alert('⚠️ No se encontró ningún producto con el código: ' + codigo);
  }
}

// -----------------------------------------------------------------
// FICHA DE PRODUCTO (SKU, descripción, neto, IVA, precio, cantidad)
// -----------------------------------------------------------------
function abrirDetalleProducto(codigo) {
  const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo || '').toString() === codigo.toString());
  if (!producto) return;

  productoSeleccionadoPOS = producto;
  cantidadSeleccionadaPOS = 1;
  renderizarDetalleProducto();

  const modal = document.getElementById('modal-detalle-producto');
  if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
}

function renderizarDetalleProducto() {
  const p = productoSeleccionadoPOS;
  if (!p) return;

  const precioBruto = Number(p.precio_venta || p.precio || 0);
  const valorNeto = Number(p.valor_neto) || Math.round(precioBruto / 1.19);
  const iva = Number(p.iva) || (precioBruto - valorNeto);
  const stock = Number(p.stock || 0);

  setTexto('det-sku', p.sku || p.codigo || '-');
  setTexto('det-nombre', p.nombre || '-');
  setTexto('det-categoria', p.categoria || 'General');
  setTexto('det-neto', `$${valorNeto.toLocaleString('es-CL')}`);
  setTexto('det-iva', `$${iva.toLocaleString('es-CL')}`);
  setTexto('det-precio', `$${precioBruto.toLocaleString('es-CL')}`);
  setTexto('det-stock', `${stock} u. disponibles`);

  const inputCantidad = document.getElementById('det-cantidad');
  if (inputCantidad) {
    inputCantidad.value = cantidadSeleccionadaPOS;
    inputCantidad.max = stock || 1;
  }

  const btnConfirmar = document.getElementById('btn-agregar-detalle');
  if (btnConfirmar) btnConfirmar.disabled = stock <= 0;
}

function setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

function cambiarCantidadDetalle(delta) {
  if (!productoSeleccionadoPOS) return;
  const stock = Number(productoSeleccionadoPOS.stock || 0);
  cantidadSeleccionadaPOS = Math.min(Math.max(1, cantidadSeleccionadaPOS + delta), stock || 1);
  const inputCantidad = document.getElementById('det-cantidad');
  if (inputCantidad) inputCantidad.value = cantidadSeleccionadaPOS;
}

function actualizarCantidadDetalleManual(valor) {
  if (!productoSeleccionadoPOS) return;
  const stock = Number(productoSeleccionadoPOS.stock || 0);
  let n = parseInt(valor, 10) || 1;
  if (n < 1) n = 1;
  if (stock > 0 && n > stock) n = stock;
  cantidadSeleccionadaPOS = n;
  const inputCantidad = document.getElementById('det-cantidad');
  if (inputCantidad) inputCantidad.value = n;
}

function confirmarAgregarDetalle() {
  const p = productoSeleccionadoPOS;
  if (!p) return;

  const codigo = p.sku || p.codigo;
  const nombre = p.nombre;
  const precio = Number(p.precio_venta || p.precio || 0);
  const stock = Number(p.stock || 0);

  agregarAlCarrito(codigo, nombre, precio, stock, cantidadSeleccionadaPOS);
  cerrarDetalleProducto();
}

function cerrarDetalleProducto() {
  const modal = document.getElementById('modal-detalle-producto');
  if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
  productoSeleccionadoPOS = null;
}

// -----------------------------------------------------------------
// ESCÁNER POR CÁMARA (usa la librería html5-qrcode cargada en index.html)
// -----------------------------------------------------------------
function abrirEscanerCamara() {
  const modal = document.getElementById('modal-escaner');
  if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }

  if (typeof Html5Qrcode === 'undefined') {
    alert('No se pudo cargar el lector de cámara. Verifica tu conexión a internet.');
    cerrarEscanerCamara();
    return;
  }

  html5QrCodeInstance = new Html5Qrcode("lector-camara");
  html5QrCodeInstance.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 220 },
    (textoDecodificado) => {
      cerrarEscanerCamara();
      buscarPorCodigoExacto(textoDecodificado.trim());
    },
    () => { /* frame sin código detectado: se ignora */ }
  ).catch((err) => {
    alert('No se pudo acceder a la cámara: ' + err);
    cerrarEscanerCamara();
  });
}

function cerrarEscanerCamara() {
  const modal = document.getElementById('modal-escaner');
  if (html5QrCodeInstance) {
    html5QrCodeInstance.stop()
      .then(() => html5QrCodeInstance.clear())
      .catch(() => {});
    html5QrCodeInstance = null;
  }
  if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
}

// -----------------------------------------------------------------
// CARRITO
// -----------------------------------------------------------------
function agregarAlCarrito(codigo, nombre, precio, stockMax, cantidad = 1) {
  const existe = carritoPOS.find(item => item.codigo === codigo);
  cantidad = Math.max(1, parseInt(cantidad, 10) || 1);

  if (existe) {
    const nuevaCantidad = existe.cantidad + cantidad;
    if (nuevaCantidad <= stockMax) {
      existe.cantidad = nuevaCantidad;
    } else {
      existe.cantidad = stockMax;
      alert("⚠️ Límite de stock alcanzado.");
    }
  } else {
    if (stockMax > 0) {
      const cantidadFinal = Math.min(cantidad, stockMax);
      carritoPOS.push({ codigo, nombre, precio, cantidad: cantidadFinal, stockMax });
    } else {
      alert("⚠️ Producto sin stock disponible.");
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
    alert("⚠️ Límite de stock disponible.");
    item.cantidad = item.stockMax;
  }

  if (item.cantidad <= 0) {
    carritoPOS.splice(index, 1);
  }
  renderizarCarritoPOS();
}

async function procesarVentaPOS() {
  if (carritoPOS.length === 0) {
    alert("El carrito está vacío.");
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
    alert(`💳 Venta realizada con éxito ($${totalCalculado.toLocaleString('es-CL')}).`);
    carritoPOS = [];
    renderizarCarritoPOS();
    await cargarDatosBackend();
  } catch (err) {
    alert("Error procesando venta: " + err.message);
  }
}
