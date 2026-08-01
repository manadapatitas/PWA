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

// Datos del negocio para documentos impresos (recetas y comprobantes de
// venta). Dirección y teléfono son los mismos que ya usa imprimirReceta().
const NEGOCIO_NOMBRE = "Manada Patitas";
const NEGOCIO_RUBRO = "Servicios veterinarios y venta de alimentos y accesorios";
const NEGOCIO_DIRECCION = "Bernardo O'Higgins 363, Linares";
const NEGOCIO_TELEFONO = "+56 9 9231 0119";
const NEGOCIO_WEB = "www.manadapatitas.cl";

let usuarioActual = null;
let sessionToken = null;

let listaPacientesGlobal = [];
let listaCitasGlobal = [];
let listaClinicaGlobal = [];
let listaPeluqueriaGlobal = [];
let listaInventarioGlobal = [];
let listaDescuentosGlobal = [];
let carritoPOS = [];
let estadoCajaHoy = { abierta: false };
let categoriaFiltroPOS = 'Todos';
let rankingVentasPorSKU = {};

// Guarda los datos de la última venta registrada, para poder imprimir el
// comprobante (con botón, no automático) desde el modal de confirmación.
let ultimaVentaParaImprimir = null;

async function cargarRankingVentas() {
  try {
    const json = await enviarFormularioBackend('obtenerRankingVentas', {});
    rankingVentasPorSKU = json.ranking || {};
  } catch (err) {
    rankingVentasPorSKU = {}; // si falla, la grilla igual funciona, solo sin orden por más vendidos
  }
}

// Estado del Dashboard (solo Administrador)
let datosDashboard = null;
let chartMasVendidos = null;
let chartMetodoPago = null;

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
  intentarRestaurarSesion();
});

// -----------------------------------------------------------------
// AUTENTICACIÓN
// -----------------------------------------------------------------
const CLAVE_STORAGE_SESION = 'mp_sesion';

function inicializarAutenticacion() {
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.onsubmit = (e) => {
      e.preventDefault();
      procesarLogin();
      return false;
    };
  }

  const inputRut = document.getElementById('login-rut');
  const inputPin = document.getElementById('login-pin');
  if (inputRut) {
    inputRut.addEventListener('blur', () => formatearInputRut(inputRut));
    inputRut.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        formatearInputRut(inputRut);
        if (inputPin) inputPin.focus();
      }
    });
  }
}

// Al cargar la página, si ya había una sesión guardada en este navegador
// (misma pestaña/ventana), se reutiliza en vez de pedir el PIN de nuevo.
// Esto evita que un simple F5 (o que el navegador recargue la app en
// segundo plano en el celular) obligue a volver a iniciar sesión.
async function intentarRestaurarSesion() {
  const guardada = sessionStorage.getItem(CLAVE_STORAGE_SESION);
  if (!guardada) {
    mostrarModalLogin();
    return;
  }

  try {
    const sesion = JSON.parse(guardada);
    sessionToken = sesion.token;
    usuarioActual = { rol: sesion.rol, nombre: sesion.nombre, rut: sesion.rut };

    aplicarSesionEnPantalla(sesion.rol, sesion.nombre);
    cerrarModalLogin();

    // Se valida contra el backend al cargar los datos: si el token ya
    // expiró, cargarDatosBackend() detecta el error y llama a cerrarSesion().
    await cargarDatosBackend();

    const pestanaDefault = (CONFIG_ROLES[sesion.rol] && CONFIG_ROLES[sesion.rol].pestanaDefault) || 'agenda';
    if (usuarioActual) cambiarPestana(pestanaDefault);
  } catch (e) {
    sessionStorage.removeItem(CLAVE_STORAGE_SESION);
    mostrarModalLogin();
  }
}

function aplicarSesionEnPantalla(rol, nombre) {
  const badgeRol = document.getElementById('usuario-badge');
  if (badgeRol) badgeRol.innerText = nombre;
  document.body.className = `autenticado rol-${rol}`;
}

async function procesarLogin() {
  const inputRut = document.getElementById('login-rut');
  const inputPin = document.getElementById('login-pin');
  const btnSubmit = document.querySelector('#form-login button[type="submit"]');

  const rutIngresado = inputRut ? inputRut.value.trim() : "";
  const pinIngresado = inputPin ? inputPin.value.trim() : "";

  if (!rutIngresado || !pinIngresado) return;

  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerText = "Verificando..."; }

  try {
    const res = await fetch(URL_WEB_APP, {
      method: 'POST',
      body: JSON.stringify({ accion: "login", rut: rutIngresado, pin: pinIngresado })
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
      usuarioActual = { rol: json.rol, nombre: json.nombre, rut: json.rut };

      sessionStorage.setItem(CLAVE_STORAGE_SESION, JSON.stringify({
        token: json.token,
        rol: json.rol,
        nombre: json.nombre,
        rut: json.rut
      }));

      aplicarSesionEnPantalla(json.rol, json.nombre);

      cerrarModalLogin();
      if (inputPin) inputPin.value = '';
      if (inputRut) inputRut.value = '';

      const pestanaDefault = (CONFIG_ROLES[json.rol] && CONFIG_ROLES[json.rol].pestanaDefault) || 'agenda';
      await cargarDatosBackend();
      cambiarPestana(pestanaDefault);
    } else {
      alert("⚠️ " + (json.message || "RUT o PIN incorrecto."));
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
  sessionStorage.removeItem(CLAVE_STORAGE_SESION);
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

  // El Dashboard y Descuentos son exclusivos de Administrador: refuerzo en el
  // frontend además del bloqueo real que ya existe en el backend (tienePermiso en codigo.gs).
  if ((idPestana === 'dashboard' || idPestana === 'descuentos') && usuarioActual.rol !== 'admin') {
    alert('Esta sección es exclusiva del perfil Administrador.');
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
    cargarEstadoCaja();
    cargarRankingVentas().then(() => filtrarProductosPOS());
  } else if (idPestana === 'descuentos') {
    renderizarDescuentos();
  } else if (idPestana === 'dashboard') {
    const selectPeriodo = document.getElementById('dashboard-filtro-periodo');
    cargarDashboard(selectPeriodo ? selectPeriodo.value : 30);
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
    listaDescuentosGlobal = data.descuentos || [];

    poblarCombosTutores();
    renderizarParrillaAgenda();
    renderizarTablaInventario();
    renderizarPOS();
    renderizarDescuentos();
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

// Genera los bloques horarios según el día de la semana:
// Lunes a Viernes: 09:00-13:30 y 15:00-17:30 (con hora de colación 13:30-15:00)
// Sábado: 09:00-13:30
// Domingo: cerrado (sin bloques) — si esto no es correcto, avisar para ajustarlo.
function generarHorasJornada(fechaStr) {
  const partes = fechaStr.split('-').map(Number);
  const fechaObj = new Date(partes[0], partes[1] - 1, partes[2]);
  const diaSemana = fechaObj.getDay(); // 0=domingo ... 6=sábado

  const bloquesManana = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
  const bloquesTarde = ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];

  if (diaSemana === 0) return []; // domingo: cerrado
  if (diaSemana === 6) return bloquesManana; // sábado: solo mañana
  return bloquesManana.concat(bloquesTarde); // lunes a viernes
}

function renderizarParrillaAgenda() {
  const contenedor = document.getElementById('grid-horarios');
  const fechaSeleccionada = document.getElementById('filtro-fecha-agenda') ? document.getElementById('filtro-fecha-agenda').value : '';
  if (!contenedor || !fechaSeleccionada) return;

  contenedor.innerHTML = '';
  const horasJornada = generarHorasJornada(fechaSeleccionada);

  if (horasJornada.length === 0) {
    contenedor.innerHTML = '<p style="color:#777; text-align:center; padding:20px;">🚫 Cerrado este día (domingo).</p>';
    return;
  }

  const ahora = new Date();
  const fechaHoyStr = ahora.toISOString().split('T')[0];
  const horaActualStr = ahora.toTimeString().substring(0, 5);

  horasJornada.forEach(hora => {
    const claveBloque = `${fechaSeleccionada} ${hora}`;
    const cita = listaCitasGlobal.find(c => {
      const rawFechaCita = c.fecha_hora || c.fecha || '';
      const estadoCita = (c.estado || '').toString().trim().toLowerCase();
      return normalizarFechaHoraCita(rawFechaCita) === claveBloque && estadoCita !== 'cancelada';
    });

    const div = document.createElement('div');
    const esPasado = (fechaSeleccionada === fechaHoyStr && hora < horaActualStr);

    if (cita) {
      div.className = 'bloque-hora ocupado';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita"><strong>🐾 ${cita.mascota || 'Reservado'}</strong><br><small>${cita.servicio || 'Atención'}</small></div>`;
      const btnCancelar = document.createElement('button');
      btnCancelar.className = 'btn-cancelar-mini';
      btnCancelar.innerText = '✖ Cancelar';
      btnCancelar.style.cssText = 'margin-top:5px;font-size:0.75rem;padding:2px 6px;background:#e74c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;';
      btnCancelar.onclick = (ev) => {
        ev.stopPropagation();
        cancelarCitaClick(cita.id_cita, cita.mascota);
      };
      div.appendChild(btnCancelar);
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

async function cancelarCitaClick(idCita, nombreMascota) {
  if (!idCita) {
    alert('No se pudo identificar esta cita (falta ID_Cita). Revisa la hoja Agenda.');
    return;
  }
  const confirmado = confirm(`¿Seguro que quieres cancelar la cita de "${nombreMascota || 'esta mascota'}"? El horario quedará disponible de nuevo.`);
  if (!confirmado) return;
  try {
    const json = await enviarFormularioBackend('cancelarCita', { id_cita: idCita });
    alert('✅ ' + json.message);
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al cancelar: ' + err.message);
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

    if (json.status === 'confirmar') {
      const aceptaActualizar = confirm(json.message);
      if (aceptaActualizar) {
        const json2 = await enviarFormularioBackend('guardarTutor', { ...payload, confirmar_actualizacion: true });
        alert('🐾 ' + json2.message);
        document.getElementById('form-tutor').reset();
        await cargarDatosBackend();
      } else {
        alert('No se modificó la ficha existente.');
      }
      return;
    }

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
    const puedeImprimir = c.receta && usuarioActual && (usuarioActual.rol === 'veterinaria' || usuarioActual.rol === 'admin');
    card.innerHTML = `
      <div style="font-size:0.85rem; color:#666;">📅 ${c.fecha || '-'} | 🐾 <strong>${c.mascota || nombreMascota}</strong>${c.atendido_por ? ` | 👩‍⚕️ ${c.atendido_por}` : ''}</div>
      <div><strong>🌡️ Temp:</strong> ${c.temperatura || '-'} °C | <strong>⚖️ Peso:</strong> ${c.peso || '-'} kg</div>
      <div><strong>🩺 Diagnóstico:</strong> ${c.diagnostico || '-'}</div>
      <div><strong>💊 Receta:</strong> ${c.receta || '-'}</div>
      ${puedeImprimir ? '<button class="btn-imprimir-receta" style="margin-top:8px;font-size:0.8rem;padding:4px 10px;background:#2e7d32;color:#fff;border:none;border-radius:4px;cursor:pointer;">🖨️ Imprimir receta</button>' : ''}
    `;
    contenedor.appendChild(card);
    if (puedeImprimir) {
      const btnImprimir = card.querySelector('.btn-imprimir-receta');
      if (btnImprimir) btnImprimir.onclick = () => imprimirReceta(c);
    }
  });
}

function imprimirReceta(atencion) {
  const ventana = window.open('', '_blank', 'width=650,height=800');
  if (!ventana) {
    alert('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio e inténtalo de nuevo.');
    return;
  }
  const fecha = atencion.fecha || new Date().toLocaleDateString('es-CL');
  const logoUrl = new URL('icon-192x192.png', window.location.href).href;
  const rutVeterinario = (usuarioActual && usuarioActual.rut) ? formatearRutChile(usuarioActual.rut) : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Receta - ${atencion.mascota || ''}</title>
    <style>
      @page { size: A5; margin: 15mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #222; padding: 20px; }
      .encabezado { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #2e7d32; padding-bottom: 10px; margin-bottom: 20px; }
      .encabezado img { height: 48px; width: 48px; object-fit: cover; border-radius: 8px; }
      .encabezado-texto h1 { margin: 0; color: #2e7d32; font-size: 1.3rem; }
      .encabezado-texto p { margin: 2px 0; font-size: 0.75rem; color: #666; }
      .datos-paciente { margin-bottom: 20px; font-size: 0.9rem; }
      .datos-paciente div { margin-bottom: 4px; }
      .seccion-receta { border: 1px solid #ccc; border-radius: 6px; padding: 15px; min-height: 150px; margin-bottom: 20px; }
      .seccion-receta h2 { margin-top: 0; font-size: 1rem; color: #2e7d32; }
      .seccion-receta p { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.5; }
      .firma { margin-top: 60px; text-align: center; font-size: 0.85rem; }
      .firma .linea { border-top: 1px solid #333; width: 220px; margin: 0 auto 6px; }
      .firma .nombre { font-weight: bold; }
      .firma .cargo, .firma .rut { color: #555; font-size: 0.8rem; }
    </style></head><body>
    <div class="encabezado">
      <img src="${logoUrl}" alt="Manada Patitas" onerror="this.style.display='none'">
      <div class="encabezado-texto">
        <h1>Manada Patitas</h1>
        <p>Receta Médica Veterinaria</p>
        <p>Bernardo O'Higgins 363, Linares · +56 9 9231 0119</p>
      </div>
    </div>
    <div class="datos-paciente">
      <div><strong>Fecha:</strong> ${fecha}</div>
      <div><strong>Tutor:</strong> ${atencion.nombre_tutor || '-'}</div>
      <div><strong>Mascota:</strong> ${atencion.mascota || '-'}</div>
      ${atencion.diagnostico ? `<div><strong>Diagnóstico:</strong> ${atencion.diagnostico}</div>` : ''}
    </div>
    <div class="seccion-receta"><h2>Indicaciones / Receta</h2><p>${(atencion.receta || '').replace(/</g, '&lt;')}</p></div>
    <div class="firma">
      <div class="linea"></div>
      <div class="nombre">${atencion.atendido_por || 'Médico Veterinario'}</div>
      <div class="cargo">Médico Veterinario</div>
      ${rutVeterinario ? `<div class="rut">RUT: ${rutVeterinario}</div>` : ''}
    </div>
    </body></html>`;
  ventana.document.write(html);
  ventana.document.close();
  ventana.onload = () => { ventana.focus(); ventana.print(); };
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
    monto: obtenerValorNumerico('pel-monto'),
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
  const selectRedondeo = document.getElementById('inv-redondeo');

  if (inputCosto) inputCosto.addEventListener('input', () => { formatearInputMiles(inputCosto); calcularPrecioVentaSugerido(); });
  if (inputMargen) inputMargen.addEventListener('input', calcularPrecioVentaSugerido);
  if (selectRedondeo) selectRedondeo.addEventListener('change', calcularPrecioVentaSugerido);
}

// Redondeo comercial: evita precios "feos" como $23.438 y sugiere algo
// más natural para el cliente, terminado en 90 o 990.
//   "cercano90"  -> sube al múltiplo de 100 más cercano y termina en 90 (ej. $23.490)
//   "redondo990" -> sube al múltiplo de 1000 más cercano y termina en 990 (ej. $23.990)
//   "ninguno"    -> deja el valor exacto calculado, sin redondear
function redondearPrecioComercial(valor, modo) {
  valor = Math.round(Number(valor) || 0);
  if (valor <= 0) return 0;

  if (modo === 'redondo990') {
    let base = Math.ceil(valor / 1000) * 1000;
    let sugerido = base - 10;
    if (sugerido < valor) sugerido += 1000;
    return sugerido;
  }

  if (modo === 'ninguno') return valor;

  let base = Math.ceil(valor / 100) * 100;
  let sugerido = base - 10;
  if (sugerido < valor) sugerido += 100;
  return sugerido;
}

function obtenerModoRedondeoSeleccionado() {
  const select = document.getElementById('inv-redondeo');
  return select ? select.value : 'cercano90';
}

function alCambiarCategoriaInventario() {
  const categoria = document.getElementById('inv-categoria').value;
  const grupoStock = document.getElementById('grupo-inv-stock');
  const grupoVencimiento = document.getElementById('grupo-inv-vencimiento');
  const inputStock = document.getElementById('inv-stock');
  if (!grupoStock || !inputStock) return;

  if (categoria === 'Servicios') {
    grupoStock.classList.add('hidden');
    grupoVencimiento.classList.add('hidden');
    inputStock.required = false;
    inputStock.value = '';
  } else {
    grupoStock.classList.remove('hidden');
    grupoVencimiento.classList.remove('hidden');
    inputStock.required = true;
  }
}

function calcularPrecioVentaSugerido() {
  const costoNeto = obtenerValorNumerico('inv-costo');
  const margenPct = parseFloat(document.getElementById('inv-margen').value) || 0;
  const precioInput = document.getElementById('inv-precio');
  const modoRedondeo = obtenerModoRedondeoSeleccionado();

  if (costoNeto > 0) {
    // 1. Neto = Costo + Margen %
    const valorVentaNeto = Math.round(costoNeto * (1 + (margenPct / 100)));
    // 2. IVA Chile 19%
    const iva = Math.round(valorVentaNeto * 0.19);
    // 3. Bruto Total exacto
    const precioExacto = valorVentaNeto + iva;
    // 4. Precio final con redondeo comercial aplicado (el que realmente se guarda)
    const precioFinalBruto = redondearPrecioComercial(precioExacto, modoRedondeo);

    if (precioInput) precioInput.value = precioFinalBruto;

    document.getElementById('lbl-inv-neto').innerText = `$${valorVentaNeto.toLocaleString('es-CL')}`;
    document.getElementById('lbl-inv-iva').innerText = `$${iva.toLocaleString('es-CL')}`;
    document.getElementById('lbl-inv-total').innerText = `$${precioFinalBruto.toLocaleString('es-CL')}`;

    const lblExacto = document.getElementById('lbl-inv-exacto');
    if (lblExacto) {
      lblExacto.innerText = modoRedondeo === 'ninguno'
        ? ''
        : `(precio exacto sin redondear: $${precioExacto.toLocaleString('es-CL')})`;
    }
  } else {
    if (precioInput) precioInput.value = '';
    document.getElementById('lbl-inv-neto').innerText = `$0`;
    document.getElementById('lbl-inv-iva').innerText = `$0`;
    document.getElementById('lbl-inv-total').innerText = `$0`;
    const lblExacto = document.getElementById('lbl-inv-exacto');
    if (lblExacto) lblExacto.innerText = '';
  }
}

// Calcula cómo mostrar la fecha de vencimiento en la tabla: color verde si
// falta bastante, naranja si vence en 30 días o menos, rojo si ya venció.
// Esta es la base para las futuras alertas y el dashboard de vencimientos.
function calcularEstadoVencimiento(fechaStr) {
  if (!fechaStr) return { texto: '-', color: '#999' };

  const fechaVenc = new Date(fechaStr.toString().substring(0, 10) + 'T00:00:00');
  if (isNaN(fechaVenc.getTime())) return { texto: fechaStr, color: '#999' };

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffDias = Math.round((fechaVenc - hoy) / 86400000);
  const fechaFormateada = fechaVenc.toLocaleDateString('es-CL');

  if (diffDias < 0) return { texto: `${fechaFormateada} ⚠️ Vencido`, color: '#e74c3c' };
  if (diffDias <= 30) return { texto: `${fechaFormateada} ⏳`, color: '#d68910' };
  return { texto: fechaFormateada, color: '#2e7d32' };
}

function renderizarTablaInventario() {
  const tbody = document.getElementById('tabla-inventario-body');
  if (!tbody) return;

  if (listaInventarioGlobal.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#777;">No hay productos en el inventario.</td></tr>';
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
    const vencInfo = calcularEstadoVencimiento(p.fecha_vencimiento);

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
      <td><strong style="color: ${vencInfo.color};">${vencInfo.texto}</strong></td>
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
    costo: obtenerValorNumerico('inv-costo'),
    margen_pct: document.getElementById('inv-margen').value,
    stock: document.getElementById('inv-stock').value,
    stock_critico: 2,
    fecha_vencimiento: document.getElementById('inv-vencimiento').value,
    redondeo: obtenerModoRedondeoSeleccionado()
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
// -----------------------------------------------------------------
// MODO VENTA RÁPIDA: funciona con CUALQUIER forma de escanear (lector
// físico USB/Bluetooth que "escribe" en el campo de búsqueda, o la cámara).
// Mientras está activado, cada código escaneado se agrega directo al
// carrito (cantidad 1, o +1 si ya estaba) sin abrir modal de confirmación.
// -----------------------------------------------------------------
let modoVentaRapidaActivo = false;

function alternarModoVentaRapida() {
  modoVentaRapidaActivo = !modoVentaRapidaActivo;
  const btn = document.getElementById('btn-escaneo-rapido');
  const inputBuscar = document.getElementById('pos-buscar');

  if (modoVentaRapidaActivo) {
    if (btn) {
      btn.innerText = '⏹ Detener venta rápida';
      btn.style.backgroundColor = '#c62828';
    }
    if (inputBuscar) {
      inputBuscar.placeholder = '⚡ Modo rápido activo: escanea con el lector y se agrega solo...';
      inputBuscar.focus();
    }
  } else {
    if (btn) {
      btn.innerText = '⚡ Venta rápida';
      btn.style.backgroundColor = '#2e7d32';
    }
    if (inputBuscar) {
      inputBuscar.placeholder = '🔍 Escanea o escribe nombre / SKU y presiona Enter...';
    }
  }
}

function configurarEventosPOS() {
  const inputBuscar = document.getElementById('pos-buscar');
  if (inputBuscar) {
    // Los lectores de código de barras USB/Bluetooth escriben el código y
    // envían un "Enter" automáticamente: lo aprovechamos para buscar
    // coincidencia exacta y mostrar la ficha del producto (modo normal), o
    // para agregar directo al carrito si el modo venta rápida está activo.
    inputBuscar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const codigo = inputBuscar.value.trim();
        if (modoVentaRapidaActivo) {
          agregarProductoEscaneadoRapido(codigo);
          inputBuscar.value = '';
        } else {
          buscarPorCodigoExacto(codigo);
        }
      }
    });
  }

  const btnScan = document.getElementById('btn-escanear-camara');
  if (btnScan) btnScan.addEventListener('click', () => abrirEscanerCamara('pos', modoVentaRapidaActivo));

  const btnScanRapido = document.getElementById('btn-escaneo-rapido');
  if (btnScanRapido) btnScanRapido.addEventListener('click', alternarModoVentaRapida);

  const btnCerrarEscaner = document.getElementById('btn-cerrar-escaner');
  if (btnCerrarEscaner) btnCerrarEscaner.addEventListener('click', cerrarEscanerCamara);

  const btnCerrarDetalle = document.getElementById('btn-cerrar-detalle');
  if (btnCerrarDetalle) btnCerrarDetalle.addEventListener('click', cerrarDetalleProducto);

  // --- Escáner y lector de código de barras dentro de Inventario ---
  const inputCodigoInv = document.getElementById('inv-codigo');
  if (inputCodigoInv) {
    // Evita que un lector de código de barras (que "escribe" y presiona Enter)
    // envíe el formulario antes de completar los demás campos.
    inputCodigoInv.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const inputNombre = document.getElementById('inv-nombre');
        if (inputNombre) inputNombre.focus();
      }
    });
  }

  const btnScanInventario = document.getElementById('btn-escanear-camara-inventario');
  if (btnScanInventario) btnScanInventario.addEventListener('click', () => abrirEscanerCamara('inventario'));

  // --- Carga masiva de inventario desde Excel/CSV ---
  const inputExcel = document.getElementById('inv-archivo-masivo');
  if (inputExcel) {
    inputExcel.addEventListener('change', () => procesarArchivoExcelInventario(inputExcel));
  }
}

function renderizarPOS() {
  filtrarProductosPOS();
  renderizarCarritoPOS();
}

function renderizarFiltrosCategoriaPOS() {
  const contenedor = document.getElementById('pos-filtros-categoria');
  if (!contenedor) return;

  const categoriasPresentes = [...new Set(listaInventarioGlobal.map(p => p.categoria || 'Otros'))];
  const categorias = ['Todos', ...categoriasPresentes];

  contenedor.innerHTML = categorias.map(cat => {
    const activo = cat === categoriaFiltroPOS;
    const estilo = activo
      ? 'background:#008080; color:#fff; border:1px solid #008080;'
      : 'background:#fff; color:#555; border:1px solid #ccc;';
    return `<span onclick="alSeleccionarCategoriaPOS('${cat.replace(/'/g, "\\'")}')" style="cursor:pointer; font-size:0.8rem; padding:5px 12px; border-radius:14px; ${estilo}">${cat}</span>`;
  }).join('');
}

function alSeleccionarCategoriaPOS(categoria) {
  categoriaFiltroPOS = categoria;
  renderizarFiltrosCategoriaPOS();
  filtrarProductosPOS();
}

function crearTarjetaProductoPOS(p, esServicio) {
  const card = document.createElement('div');
  card.className = 'pos-card-item';
  if (esServicio) card.style.cssText = 'background:#e0f2f1; border-color:#80cbc4;';

  const nombre = p.nombre || 'Producto';
  const precio = Number(p.precio_venta || p.precio || 0);
  const stock = Number(p.stock || 0);
  const codigo = p.sku || p.codigo || '';
  const lineaStock = esServicio ? 'Servicio' : `SKU: ${codigo || '-'} · Stock: ${stock} u.`;

  card.innerHTML = `
    <div class="pos-item-title">${nombre}</div>
    <div class="pos-item-price">$${precio.toLocaleString('es-CL')}</div>
    <div class="pos-item-stock">${lineaStock}</div>
  `;
  card.onclick = () => abrirDetalleProducto(codigo);
  return card;
}

function filtrarProductosPOS() {
  const contenedor = document.getElementById('pos-grid-productos');
  const buscarInput = document.getElementById('pos-buscar');
  if (!contenedor) return;

  renderizarFiltrosCategoriaPOS();

  const termino = buscarInput ? buscarInput.value.toLowerCase().trim() : "";
  contenedor.innerHTML = '';

  let productosFiltrados = listaInventarioGlobal.filter(p => {
    if (categoriaFiltroPOS !== 'Todos' && (p.categoria || 'Otros') !== categoriaFiltroPOS) return false;
    if (termino === "") return true;
    const nom = (p.nombre || '').toLowerCase();
    const cod = (p.sku || p.codigo || '').toString().toLowerCase();
    return nom.includes(termino) || cod.includes(termino);
  });

  const servicios = productosFiltrados.filter(p => p.categoria === 'Servicios');
  const productos = productosFiltrados.filter(p => p.categoria !== 'Servicios');
  // Más vendidos primero (según Ventas_Detalle); los sin ventas registradas quedan al final, sin desordenarse entre sí.
  productos.sort((a, b) => {
    const ventasA = rankingVentasPorSKU[a.sku || a.codigo] || 0;
    const ventasB = rankingVentasPorSKU[b.sku || b.codigo] || 0;
    return ventasB - ventasA;
  });

  if (servicios.length === 0 && productos.length === 0) {
    contenedor.innerHTML = '<p style="color:#777; grid-column: 1/-1;">No se encontraron productos.</p>';
    return;
  }

  if (servicios.length > 0) {
    const tituloServicios = document.createElement('p');
    tituloServicios.style.cssText = 'grid-column:1/-1; font-size:0.8rem; color:#00695c; font-weight:600; margin:0 0 4px;';
    tituloServicios.innerText = 'Servicios';
    contenedor.appendChild(tituloServicios);
    servicios.forEach(p => contenedor.appendChild(crearTarjetaProductoPOS(p, true)));
  }

  if (productos.length > 0) {
    const tituloProductos = document.createElement('p');
    tituloProductos.style.cssText = `grid-column:1/-1; font-size:0.8rem; color:#777; font-weight:600; margin:${servicios.length > 0 ? '10px' : '0'} 0 4px;`;
    tituloProductos.innerText = 'Productos, ordenados por más vendidos';
    contenedor.appendChild(tituloProductos);
    productos.forEach(p => contenedor.appendChild(crearTarjetaProductoPOS(p, false)));
  }
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
// Sirve tanto para el POS (buscar y agregar al carrito) como para
// Inventario (rellenar el campo de código al dar de alta un producto).
//
// Tiene dos modos para el POS:
// - Normal (un disparo): escanea 1 código, abre la ficha del producto para
//   confirmar/ajustar cantidad, y cierra la cámara. Útil para cantidades
//   específicas de un mismo producto.
// - Rápido/continuo ("Venta rápida"): la cámara queda encendida escaneando
//   sin parar; cada código detectado se agrega directo al carrito con
//   cantidad 1 (si ya estaba en el carrito, solo suma +1), sin abrir
//   ningún modal ni interrumpir con alert(). Ideal para varios productos
//   distintos seguidos. Un "enfriamiento" de 1.5s por código evita que el
//   mismo producto se agregue varias veces mientras sigue frente a la cámara.
// -----------------------------------------------------------------
let escanerDestinoActual = 'pos';
let escaneoContinuoActivo = false;
let ultimosCodigosEscaneados = {}; // { codigo: timestamp } para el enfriamiento
const ENFRIAMIENTO_ESCANEO_MS = 1500;

function abrirEscanerCamara(destino = 'pos', modoRapido = false) {
  escanerDestinoActual = destino;
  escaneoContinuoActivo = modoRapido;
  ultimosCodigosEscaneados = {};

  const modal = document.getElementById('modal-escaner');
  const titulo = document.getElementById('escaner-titulo');
  const instrucciones = document.getElementById('escaner-instrucciones');
  const feedback = document.getElementById('escaner-feedback');
  const btnCerrar = document.getElementById('btn-cerrar-escaner');

  if (feedback) feedback.innerText = '';
  if (modoRapido) {
    if (titulo) titulo.innerText = '⚡ Venta rápida — escaneo continuo';
    if (instrucciones) instrucciones.innerText = 'Escanea productos uno tras otro: se agregan solos al carrito. Presiona "Detener" cuando termines.';
    if (btnCerrar) btnCerrar.innerText = '⏹ Detener escaneo';
  } else {
    if (titulo) titulo.innerText = '📷 Escanear código de barras';
    if (instrucciones) instrucciones.innerText = 'Apunta la cámara al código de barras del producto.';
    if (btnCerrar) btnCerrar.innerText = 'Cancelar';
  }

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
      const codigo = textoDecodificado.trim();

      if (!escaneoContinuoActivo) {
        cerrarEscanerCamara();
        if (escanerDestinoActual === 'inventario') {
          rellenarCodigoInventario(codigo);
        } else {
          buscarPorCodigoExacto(codigo);
        }
        return;
      }

      // Modo continuo: nunca cierra la cámara sola: ignora repeticiones del
      // mismo código dentro de la ventana de enfriamiento, y agrega directo.
      const ahora = Date.now();
      if (ultimosCodigosEscaneados[codigo] && (ahora - ultimosCodigosEscaneados[codigo]) < ENFRIAMIENTO_ESCANEO_MS) {
        return;
      }
      ultimosCodigosEscaneados[codigo] = ahora;
      agregarProductoEscaneadoRapido(codigo);
    },
    () => { /* frame sin código detectado: se ignora */ }
  ).catch((err) => {
    alert('No se pudo acceder a la cámara: ' + err);
    cerrarEscanerCamara();
  });
}

// Agrega un producto directo al carrito (cantidad 1, o +1 si ya estaba) sin
// abrir ningún modal, y muestra feedback breve dentro del propio modal de
// escáner (nunca alert(), para no interrumpir el escaneo continuo).
function agregarProductoEscaneadoRapido(codigo) {
  // Si el modal de cámara está abierto, el feedback va ahí; si el escaneo
  // viene del lector físico (sin cámara abierta), va en la línea junto al
  // buscador del POS.
  const modalCamaraAbierto = document.getElementById('modal-escaner') &&
    document.getElementById('modal-escaner').style.display === 'flex';
  const feedback = document.getElementById(modalCamaraAbierto ? 'escaner-feedback' : 'pos-scan-feedback');
  const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo || '').toString().trim() === codigo);

  if (!producto) {
    if (feedback) {
      feedback.style.color = '#c62828';
      feedback.innerText = `⚠️ Código no encontrado: ${codigo}`;
    }
    return;
  }

  const stock = Number(producto.stock || 0);
  if (stock <= 0) {
    if (feedback) {
      feedback.style.color = '#c62828';
      feedback.innerText = `⚠️ Sin stock: ${producto.nombre}`;
    }
    return;
  }

  agregarAlCarrito(producto.sku || producto.codigo, producto.nombre, Number(producto.precio_venta || producto.precio || 0), stock, 1);
  if (feedback) {
    feedback.style.color = '#2e7d32';
    feedback.innerText = `✅ Agregado: ${producto.nombre}`;
  }
}

function rellenarCodigoInventario(codigo) {
  const inputCodigo = document.getElementById('inv-codigo');
  if (inputCodigo) inputCodigo.value = codigo;

  // Si el SKU ya existe en el inventario, se avisa y se precargan sus datos
  // para facilitar "reingresar stock" del mismo producto escaneado.
  const productoExistente = listaInventarioGlobal.find(p => (p.sku || p.codigo || '').toString().trim() === codigo);
  if (productoExistente) {
    document.getElementById('inv-nombre').value = productoExistente.nombre || '';
    document.getElementById('inv-categoria').value = productoExistente.categoria || 'Alimentos';
    alCambiarCategoriaInventario();
    document.getElementById('inv-costo').value = productoExistente.costo ? Number(productoExistente.costo).toLocaleString('es-CL') : '';
    document.getElementById('inv-margen').value = productoExistente.margen_pct || 30;
    const inputVencimiento = document.getElementById('inv-vencimiento');
    if (inputVencimiento) inputVencimiento.value = (productoExistente.fecha_vencimiento || '').toString().substring(0, 10);
    calcularPrecioVentaSugerido();
  }

  const inputStock = document.getElementById('inv-stock');
  if (inputStock) inputStock.focus();
}

function cerrarEscanerCamara() {
  escaneoContinuoActivo = false;
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
// CARGA MASIVA DE INVENTARIO DESDE EXCEL/CSV (usa la librería SheetJS/XLSX
// cargada en index.html). Todo el parseo ocurre en el navegador; solo se
// envía al backend el arreglo final de productos ya normalizado.
// -----------------------------------------------------------------
async function procesarArchivoExcelInventario(inputFile) {
  const archivo = inputFile.files[0];
  if (!archivo) return;

  const estadoDiv = document.getElementById('inv-carga-masiva-estado');
  const marcarEstado = (texto) => { if (estadoDiv) estadoDiv.innerText = texto; };

  if (typeof XLSX === 'undefined') {
    alert('No se pudo cargar el lector de Excel. Verifica tu conexión a internet.');
    return;
  }

  marcarEstado('📄 Leyendo archivo...');

  try {
    const bufferArchivo = await archivo.arrayBuffer();
    const libro = XLSX.read(bufferArchivo, { type: 'array', cellDates: true });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });

    if (filas.length === 0) {
      alert('El archivo no tiene filas de datos.');
      marcarEstado('');
      return;
    }

    const productos = filas
      .map(normalizarFilaExcelProducto)
      .filter(p => p.codigo && p.nombre);

    if (productos.length === 0) {
      alert('No se encontraron filas válidas. Verifica que las columnas se llamen algo como: Codigo, Nombre, Categoria, Costo, Margen_Pct y Stock.');
      marcarEstado('');
      return;
    }

    marcarEstado(`⬆️ Subiendo ${productos.length} producto(s)...`);

    const json = await enviarFormularioBackend('guardarProductosMasivo', {
      productos,
      redondeo: obtenerModoRedondeoSeleccionado()
    });

    let mensajeFinal = '📦 ' + json.message;
    if (json.errores && json.errores.length > 0) {
      mensajeFinal += '\n\nDetalle de filas con problemas:\n' + json.errores.join('\n');
    }
    alert(mensajeFinal);

    marcarEstado('');
    inputFile.value = '';
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al procesar el archivo: ' + err.message);
    marcarEstado('');
  }
}

// Acepta encabezados flexibles (con/sin tildes, mayúsculas, sinónimos comunes)
function normalizarFilaExcelProducto(fila) {
  const obtenerValor = (posiblesNombres) => {
    for (const claveOriginal of Object.keys(fila)) {
      const claveNormalizada = claveOriginal.toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
      if (posiblesNombres.includes(claveNormalizada)) return fila[claveOriginal];
    }
    return '';
  };

  return {
    codigo: obtenerValor(['codigo', 'sku']).toString().trim(),
    nombre: obtenerValor(['nombre', 'producto', 'descripcion']).toString().trim(),
    categoria: obtenerValor(['categoria']).toString().trim() || 'General',
    costo: obtenerValor(['costo', 'costo neto', 'costo_neto']),
    margen_pct: obtenerValor(['margen_pct', 'margen', 'margen (%)', 'margen %']),
    stock: obtenerValor(['stock', 'cantidad']),
    stock_critico: obtenerValor(['stock_critico', 'stock critico', 'stock minimo']) || 2,
    fecha_vencimiento: formatearFechaExcel(obtenerValor(['fecha_vencimiento', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento']))
  };
}

// Normaliza una fecha proveniente de Excel a "yyyy-MM-dd". SheetJS puede
// entregarla como objeto Date (si se leyó con cellDates:true), como número
// de serie de Excel (si la celda no tenía formato de fecha), o como texto.
function formatearFechaExcel(valor) {
  if (!valor && valor !== 0) return '';

  if (valor instanceof Date) {
    return valor.toISOString().split('T')[0];
  }

  if (typeof valor === 'number') {
    const fechaBase = new Date(Date.UTC(1899, 11, 30));
    const fecha = new Date(fechaBase.getTime() + valor * 86400000);
    return fecha.toISOString().split('T')[0];
  }

  return valor.toString().trim();
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
    actualizarBannerCombo();
    return;
  }

  contenedor.innerHTML = '';
  let totalCalculado = 0;

  carritoPOS.forEach((item, index) => {
    const precioEfectivo = calcularPrecioEfectivoItem(item, carritoPOS);
    const tieneDescuento = precioEfectivo < item.precio;
    const subtotal = precioEfectivo * item.cantidad;
    totalCalculado += subtotal;

    const row = document.createElement('div');
    row.className = 'cart-item-row';
    const lineaPrecioUnitario = tieneDescuento
      ? `<small><s style="color:#999;">$${item.precio.toLocaleString('es-CL')}</s> $${precioEfectivo.toLocaleString('es-CL')} c/u 🏷️</small>`
      : `<small>$${item.precio.toLocaleString('es-CL')} c/u</small>`;
    row.innerHTML = `
      <div style="flex:1;">
        <strong>${item.nombre}</strong><br>
        ${lineaPrecioUnitario}
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
  actualizarVueltoPOS();
  actualizarBannerCombo();
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

// -----------------------------------------------------------------
// APERTURA / CIERRE DE CAJA
// -----------------------------------------------------------------

async function cargarEstadoCaja() {
  const textoEstado = document.getElementById('texto-estado-caja');
  const btnAbrir = document.getElementById('btn-abrir-caja');
  const btnCerrar = document.getElementById('btn-cerrar-caja');
  if (!textoEstado) return;

  try {
    const json = await enviarFormularioBackend('obtenerEstadoCaja', {});
    estadoCajaHoy = json;

    if (json.abierta) {
      textoEstado.innerHTML = `🔓 Caja abierta desde las <strong>${json.hora_apertura}</strong> por <strong>${json.usuario_apertura}</strong> — Apertura: <strong>${formatearMoneda(json.monto_apertura)}</strong>`;
      btnAbrir.classList.add('hidden');
      btnCerrar.classList.remove('hidden');
    } else {
      textoEstado.innerHTML = '🔒 La caja no ha sido abierta hoy.';
      btnAbrir.classList.remove('hidden');
      btnCerrar.classList.add('hidden');
    }
  } catch (err) {
    textoEstado.innerText = 'No se pudo consultar el estado de la caja.';
  }
}

function mostrarModalAperturaCaja() {
  const input = document.getElementById('input-monto-apertura');
  if (input) input.value = '';
  document.getElementById('modal-apertura-caja').style.display = 'flex';
}

function ocultarModalAperturaCaja() {
  document.getElementById('modal-apertura-caja').style.display = 'none';
}

async function confirmarAperturaCaja() {
  const monto = obtenerValorNumerico('input-monto-apertura');
  if (isNaN(monto) || monto < 0) {
    alert('Ingresa un monto de apertura válido.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-apertura');
  if (btn) { btn.disabled = true; btn.innerText = 'Abriendo...'; }

  try {
    const json = await enviarFormularioBackend('abrirCaja', { monto_apertura: monto });
    alert('✅ ' + json.message);
    ocultarModalAperturaCaja();
    await cargarEstadoCaja();
  } catch (err) {
    alert('Error al abrir caja: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Abrir Caja'; }
  }
}

async function mostrarModalCierreCaja() {
  // Trae el monto esperado más actualizado posible (incluye ventas hechas
  // segundos antes de abrir el modal), en vez de confiar en el último
  // estado cacheado desde que se abrió la pestaña.
  await cargarEstadoCaja();
  if (!estadoCajaHoy.abierta) {
    alert('No hay una caja abierta para cerrar.');
    return;
  }

  document.getElementById('cierre-monto-apertura').innerText = formatearMoneda(estadoCajaHoy.monto_apertura);
  document.getElementById('cierre-ventas-efectivo').innerText = formatearMoneda(estadoCajaHoy.ventas_efectivo_hoy);
  document.getElementById('cierre-monto-esperado').innerText = formatearMoneda(estadoCajaHoy.monto_esperado_preview);
  document.getElementById('input-monto-contado').value = '';
  document.getElementById('cierre-diferencia-texto').innerText = 'Diferencia: $0';
  document.getElementById('modal-cierre-caja').style.display = 'flex';
}

function ocultarModalCierreCaja() {
  document.getElementById('modal-cierre-caja').style.display = 'none';
}

function actualizarDiferenciaCierre() {
  const contado = obtenerValorNumerico('input-monto-contado') || 0;
  const esperado = Number(estadoCajaHoy.monto_esperado_preview) || 0;
  const diferencia = contado - esperado;
  const texto = document.getElementById('cierre-diferencia-texto');

  if (diferencia === 0) {
    texto.innerText = 'Diferencia: $0 (cuadra exacto)';
    texto.style.color = '#2e7d32';
  } else if (diferencia > 0) {
    texto.innerText = `Diferencia: +${formatearMoneda(diferencia)} (sobra dinero)`;
    texto.style.color = '#2e7d32';
  } else {
    texto.innerText = `Diferencia: -${formatearMoneda(Math.abs(diferencia))} (falta dinero)`;
    texto.style.color = '#c62828';
  }
}

async function confirmarCierreCaja() {
  const contado = obtenerValorNumerico('input-monto-contado');
  if (isNaN(contado) || contado < 0) {
    alert('Ingresa el monto contado físicamente en caja.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-cierre');
  if (btn) { btn.disabled = true; btn.innerText = 'Cerrando...'; }

  try {
    const json = await enviarFormularioBackend('cerrarCaja', { monto_contado: contado });
    alert(`✅ Caja cerrada.\nEsperado: ${formatearMoneda(json.monto_esperado)}\nContado: ${formatearMoneda(json.monto_contado)}\nDiferencia: ${formatearMoneda(json.diferencia)}`);
    ocultarModalCierreCaja();
    await cargarEstadoCaja();
  } catch (err) {
    alert('Error al cerrar caja: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Cerrar Caja'; }
  }
}

// -----------------------------------------------------------------
// PAGO EN EFECTIVO: monto entregado y vuelto
// -----------------------------------------------------------------

function alCambiarMetodoPagoPOS() {
  const metodo = document.getElementById('pos-metodo-pago').value;
  const grupo = document.getElementById('grupo-efectivo-pos');
  if (!grupo) return;

  if (metodo === 'Efectivo') {
    grupo.classList.remove('hidden');
    actualizarVueltoPOS();
  } else {
    grupo.classList.add('hidden');
  }
}

function actualizarVueltoPOS() {
  const total = calcularTotalCarritoConDescuentos(carritoPOS);
  const entregado = obtenerValorNumerico('pos-monto-entregado');
  const vuelto = entregado - total;
  const texto = document.getElementById('pos-vuelto-texto');
  if (!texto) return;

  if (entregado === 0) {
    texto.innerText = 'Vuelto a entregar: $0';
    texto.style.color = '#777';
  } else if (vuelto < 0) {
    texto.innerText = `Falta ${formatearMoneda(Math.abs(vuelto))} para cubrir el total`;
    texto.style.color = '#c62828';
  } else {
    texto.innerText = `Vuelto a entregar: ${formatearMoneda(vuelto)}`;
    texto.style.color = '#2e7d32';
  }
}

function cancelarVentaPOS() {
  if (carritoPOS.length === 0) return;

  const confirmado = confirm('¿Cancelar esta venta? Se vaciará todo el carrito actual (no afecta el stock, ya que aún no se registró ninguna venta).');
  if (!confirmado) return;

  carritoPOS = [];
  renderizarCarritoPOS();
  const inputEntregado = document.getElementById('pos-monto-entregado');
  if (inputEntregado) inputEntregado.value = '';
  actualizarVueltoPOS();
}

async function procesarVentaPOS() {
  if (carritoPOS.length === 0) {
    alert("El carrito está vacío.");
    return;
  }

  const metodoPago = document.getElementById('pos-metodo-pago').value;
  // Los ítems se envían con el precio EFECTIVO (ya con descuento aplicado si corresponde),
  // no el precio de catálogo — así el registro en Ventas_Detalle y el margen quedan
  // consistentes con lo que realmente se cobró.
  const itemsConDescuento = carritoPOS.map(i => ({ ...i, precio: calcularPrecioEfectivoItem(i, carritoPOS) }));
  const totalCalculado = itemsConDescuento.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);

  const payload = {
    metodo_pago: metodoPago,
    total: totalCalculado,
    items: itemsConDescuento
  };

  if (metodoPago === 'Efectivo') {
    if (!estadoCajaHoy.abierta) {
      alert('⚠️ Debes abrir la caja antes de registrar ventas en efectivo.');
      return;
    }
    const entregado = obtenerValorNumerico('pos-monto-entregado');
    if (entregado < totalCalculado) {
      alert(`El monto entregado ($${entregado.toLocaleString('es-CL')}) es menor al total de la venta ($${totalCalculado.toLocaleString('es-CL')}).`);
      return;
    }
    payload.monto_entregado = entregado;
    payload.vuelto = entregado - totalCalculado;
  }

  try {
    const respuesta = await enviarFormularioBackend('guardarVenta', payload);

    // Se guardan los datos completos (incluyendo precio original de catálogo,
    // para poder mostrar el descuento tachado en el comprobante impreso) antes
    // de vaciar el carrito.
    ultimaVentaParaImprimir = {
      idVenta: respuesta.id_venta || '-',
      fecha: new Date(),
      cajero: usuarioActual ? usuarioActual.nombre : '-',
      metodoPago: metodoPago,
      items: carritoPOS.map(i => {
        const precioEfectivo = calcularPrecioEfectivoItem(i, carritoPOS);
        return {
          nombre: i.nombre,
          cantidad: i.cantidad,
          precioOriginal: i.precio,
          precioEfectivo: precioEfectivo,
          subtotal: precioEfectivo * i.cantidad
        };
      }),
      total: totalCalculado,
      montoEntregado: metodoPago === 'Efectivo' ? payload.monto_entregado : null,
      vuelto: metodoPago === 'Efectivo' ? payload.vuelto : null
    };

    mostrarModalVentaRegistrada(ultimaVentaParaImprimir);

    carritoPOS = [];
    renderizarCarritoPOS();
    const inputEntregado = document.getElementById('pos-monto-entregado');
    if (inputEntregado) inputEntregado.value = '';
    actualizarVueltoPOS();
    await cargarDatosBackend();
  } catch (err) {
    alert("Error procesando venta: " + err.message);
  }
}

// -----------------------------------------------------------------
// MODAL DE VENTA REGISTRADA + IMPRESIÓN DE COMPROBANTE (80mm / 72mm)
// -----------------------------------------------------------------
function mostrarModalVentaRegistrada(venta) {
  document.getElementById('venta-ok-total').innerText = formatearMoneda(venta.total);
  document.getElementById('venta-ok-medio').innerText = venta.metodoPago;

  const wrapVuelto = document.getElementById('venta-ok-vuelto-wrap');
  if (venta.metodoPago === 'Efectivo' && wrapVuelto) {
    document.getElementById('venta-ok-vuelto').innerText = formatearMoneda(venta.vuelto);
    wrapVuelto.classList.remove('hidden');
  } else if (wrapVuelto) {
    wrapVuelto.classList.add('hidden');
  }

  const modal = document.getElementById('modal-venta-registrada');
  if (modal) modal.style.display = 'flex';
}

function cerrarModalVentaRegistrada() {
  const modal = document.getElementById('modal-venta-registrada');
  if (modal) modal.style.display = 'none';
  ultimaVentaParaImprimir = null;
}

// Imprime el comprobante interno de la última venta (NO es una boleta ni
// factura: ese documento tributario lo emite el dispositivo TUU aparte).
// Sigue el mismo patrón que imprimirReceta(): ventana nueva + print().
function imprimirComprobanteVenta() {
  const venta = ultimaVentaParaImprimir;
  if (!venta) return;

  const ventana = window.open('', '_blank', 'width=400,height=700');
  if (!ventana) {
    alert('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio e inténtalo de nuevo.');
    return;
  }

  const fechaTexto = venta.fecha.toLocaleDateString('es-CL') + ' ' +
    venta.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  const totalDescuentos = venta.items.reduce((sum, it) =>
    sum + (it.precioOriginal - it.precioEfectivo) * it.cantidad, 0);

  const filasItems = venta.items.map(it => {
    const tieneDescuento = it.precioEfectivo < it.precioOriginal;
    const lineaCombo = tieneDescuento
      ? `<div class="linea-combo">Descuento: <span class="tachado">$${(it.precioOriginal * it.cantidad).toLocaleString('es-CL')}</span></div>`
      : '';
    return `
      <div class="item-fila">
        <span>${it.cantidad}x ${it.nombre}</span>
        <span>$${it.subtotal.toLocaleString('es-CL')}</span>
      </div>
      ${lineaCombo}
    `;
  }).join('');

  const filaDescuentos = totalDescuentos > 0
    ? `<div class="resumen-fila secundario"><span>Descuentos</span><span>-$${totalDescuentos.toLocaleString('es-CL')}</span></div>`
    : '';

  const filasEfectivo = venta.metodoPago === 'Efectivo'
    ? `
      <div class="resumen-fila secundario"><span>Recibido</span><span>$${Number(venta.montoEntregado || 0).toLocaleString('es-CL')}</span></div>
      <div class="resumen-fila secundario"><span>Vuelto</span><span>$${Number(venta.vuelto || 0).toLocaleString('es-CL')}</span></div>
    `
    : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Comprobante ${venta.idVenta}</title>
    <style>
      @page { size: 72mm auto; margin: 2mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.55; color: #000; width: 72mm; margin: 0 auto; padding: 2mm; }
      .logo-negocio { display: block; width: 30mm; margin: 0 auto 4px; }
      .centrado { text-align: center; }
      .nombre-negocio { font-size: 16px; font-weight: bold; letter-spacing: 0.5px; }
      .secundario { font-weight: normal; }
      .separador { border-top: 2px dashed #000; margin: 6px 0; }
      .fila { display: flex; justify-content: space-between; font-weight: bold; }
      .item-fila { display: flex; justify-content: space-between; margin-top: 4px; font-weight: bold; }
      .linea-combo { padding-left: 6px; font-size: 11px; }
      .tachado { text-decoration: line-through; }
      .resumen-fila { display: flex; justify-content: space-between; margin-top: 3px; font-weight: bold; }
      .resumen-fila.secundario { font-weight: normal; }
      .total-fila { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin-top: 4px; }
      .aviso-no-tributario { text-align: center; font-weight: bold; margin: 8px 0; }
      .gracias { text-align: center; margin-top: 8px; font-weight: bold; }
    </style></head><body>
    <div class="centrado">
      <img class="logo-negocio" src="${new URL('logo_termico.png', window.location.href).href}" alt="" onerror="this.style.display='none'">
      <div class="nombre-negocio">${NEGOCIO_NOMBRE.toUpperCase()}</div>
      <div class="secundario">${NEGOCIO_RUBRO}</div>
      <div class="secundario">${NEGOCIO_DIRECCION}</div>
      <div class="secundario">${NEGOCIO_TELEFONO}</div>
    </div>
    <div class="separador"></div>
    <div class="fila"><span>Venta N</span><span>${venta.idVenta}</span></div>
    <div class="fila"><span>Fecha</span><span>${fechaTexto}</span></div>
    <div class="fila"><span>Cajero</span><span>${venta.cajero}</span></div>
    <div class="separador"></div>
    ${filasItems}
    <div class="separador"></div>
    ${filaDescuentos}
    <div class="total-fila"><span>TOTAL</span><span>$${venta.total.toLocaleString('es-CL')}</span></div>
    <div class="resumen-fila secundario"><span>Medio de pago</span><span>${venta.metodoPago}</span></div>
    ${filasEfectivo}
    <div class="separador"></div>
    <div class="aviso-no-tributario">Comprobante interno<br>no válido como boleta ni factura</div>
    <div class="separador"></div>
    <div class="gracias">Gracias por tu compra<br>y por cuidar a tu mascota con nosotros<br>${NEGOCIO_WEB}</div>
    </body></html>`;

  ventana.document.write(html);
  ventana.document.close();
  ventana.onload = () => { ventana.focus(); ventana.print(); };
}

// -----------------------------------------------------------------
// DASHBOARD DE NEGOCIO (solo Administrador)
// -----------------------------------------------------------------
async function cargarDashboard(dias = 30) {
  if (!usuarioActual || usuarioActual.rol !== 'admin') return;

  try {
    const json = await enviarFormularioBackend('obtenerDashboard', { dias });
    datosDashboard = json;
    renderizarDashboard();
  } catch (err) {
    alert('Error al cargar el dashboard: ' + err.message);
  }
}

// -----------------------------------------------------------------
// DESCUENTOS (solo Admin): un mecanismo para descuento unitario y cruzado.
// El precio final NUNCA se guarda fijo: se calcula en el momento, tanto
// acá (vista previa del Admin) como en el POS (venta real).
// -----------------------------------------------------------------

function calcularPrecioConValorDescuento(precioOriginal, tipoValor, valor) {
  if (tipoValor === 'Porcentaje') {
    return Math.round(precioOriginal * (1 - (Number(valor) || 0) / 100));
  }
  return Math.max(0, Math.round(precioOriginal - (Number(valor) || 0)));
}

function renderizarDescuentos() {
  const selectProducto = document.getElementById('desc-producto');
  const selectPrincipal = document.getElementById('desc-principal');
  if (!selectProducto || !selectPrincipal) return; // sección no visible (no es Admin)

  const opciones = listaInventarioGlobal.map(p =>
    `<option value="${p.sku || p.codigo}">${p.nombre} ($${Number(p.precio_venta || p.precio || 0).toLocaleString('es-CL')})</option>`
  ).join('');
  selectProducto.innerHTML = '<option value="">-- Selecciona un producto --</option>' + opciones;
  selectPrincipal.innerHTML = '<option value="">-- Selecciona un producto --</option>' + opciones;

  renderizarTablaDescuentos();
}

function renderizarTablaDescuentos() {
  const tbody = document.getElementById('desc-tabla-body');
  if (!tbody) return;
  const activos = listaDescuentosGlobal.filter(d => (d.activo || '').toLowerCase() !== 'no');

  if (activos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#777;">No hay descuentos activos.</td></tr>';
    return;
  }

  tbody.innerHTML = activos.map(d => {
    const condicion = d.sku_principal ? `Combo con: ${d.nombre_principal}` : 'Sin condición (unitario)';
    const valorTexto = d.tipo_valor === 'Porcentaje' ? `${d.valor}%` : `$${Number(d.valor).toLocaleString('es-CL')}`;

    // Precio y margen final: se calculan aquí igual que en la vista previa,
    // buscando el producto en el inventario actual (no quedan guardados fijos
    // en el descuento, para que reflejen siempre el precio/costo vigente).
    const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo) === d.sku_producto);
    let precioFinalTexto = '—';
    let margenTexto = '—';
    let colorMargen = '#333';
    if (producto) {
      const precioOriginal = Number(producto.precio_venta || producto.precio || 0);
      const costo = Number(producto.costo || 0);
      const precioFinal = calcularPrecioConValorDescuento(precioOriginal, d.tipo_valor, Number(d.valor));
      const margen = precioFinal - costo;
      colorMargen = margen >= 0 ? '#2e7d32' : '#c62828';
      precioFinalTexto = `$${precioFinal.toLocaleString('es-CL')}`;
      margenTexto = `$${margen.toLocaleString('es-CL')}${margen < 0 ? ' (pérdida)' : ''}`;
    }

    return `
      <tr>
        <td>${d.nombre_producto}</td>
        <td>${condicion}</td>
        <td>${valorTexto}</td>
        <td>${precioFinalTexto}</td>
        <td style="color:${colorMargen}; font-weight:600;">${margenTexto}</td>
        <td><button class="btn-danger" style="padding:4px 10px; font-size:0.8rem;" onclick="eliminarDescuentoClick('${d.id_descuento}')">Eliminar</button></td>
      </tr>
    `;
  }).join('');
}

function alCambiarTipoDescuento() {
  const tipo = document.getElementById('desc-tipo').value;
  const grupo = document.getElementById('grupo-desc-principal');
  if (tipo === 'cruzado') {
    grupo.classList.remove('hidden');
  } else {
    grupo.classList.add('hidden');
    document.getElementById('desc-principal').value = '';
  }
  actualizarPreviewDescuento();
}

function actualizarPreviewDescuento() {
  const skuProducto = document.getElementById('desc-producto').value;
  const tipo = document.getElementById('desc-tipo').value;
  const skuPrincipal = document.getElementById('desc-principal').value;
  const tipoValor = document.getElementById('desc-tipo-valor').value;
  const valor = Number(document.getElementById('desc-valor').value) || 0;
  const previewBox = document.getElementById('desc-preview-box');
  const previewGrid = document.getElementById('desc-preview-grid');

  if (!skuProducto || valor <= 0) {
    previewBox.classList.add('hidden');
    return;
  }

  const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo) === skuProducto);
  if (!producto) { previewBox.classList.add('hidden'); return; }

  const precioOriginal = Number(producto.precio_venta || producto.precio || 0);
  const costo = Number(producto.costo || 0);
  const precioFinal = calcularPrecioConValorDescuento(precioOriginal, tipoValor, valor);
  const margen = precioFinal - costo; // margen bruto simplificado, para una vista rápida de referencia
  const colorMargen = margen >= 0 ? '#2e7d32' : '#c62828';

  let html = `
    <div><strong>Precio original:</strong> $${precioOriginal.toLocaleString('es-CL')}</div>
    <div><strong>Precio con descuento:</strong> $${precioFinal.toLocaleString('es-CL')}</div>
    <div><strong>Costo del producto:</strong> $${costo.toLocaleString('es-CL')}</div>
    <div><strong>Margen resultante:</strong> <span style="color:${colorMargen}; font-weight:bold;">$${margen.toLocaleString('es-CL')}</span>${margen < 0 ? ' (pérdida)' : ''}</div>
  `;

  if (tipo === 'cruzado' && skuPrincipal) {
    const principal = listaInventarioGlobal.find(p => (p.sku || p.codigo) === skuPrincipal);
    if (principal) {
      const precioPrincipal = Number(principal.precio_venta || principal.precio || 0);
      const valorCombo = precioPrincipal + precioFinal;
      html += `<div style="grid-column: 1/-1;"><strong>Valor final del combo (${principal.nombre} + ${producto.nombre}):</strong> <span style="color:#008080; font-weight:bold;">$${valorCombo.toLocaleString('es-CL')}</span></div>`;
    }
  }

  previewGrid.innerHTML = html;
  previewBox.classList.remove('hidden');
}

async function crearDescuento() {
  const skuProducto = document.getElementById('desc-producto').value;
  const tipo = document.getElementById('desc-tipo').value;
  const skuPrincipal = document.getElementById('desc-principal').value;
  const tipoValor = document.getElementById('desc-tipo-valor').value;
  const valor = Number(document.getElementById('desc-valor').value) || 0;

  if (!skuProducto) { alert('Selecciona un producto a descontar.'); return; }
  if (tipo === 'cruzado' && !skuPrincipal) { alert('Selecciona el producto principal del combo.'); return; }
  if (valor <= 0) { alert('Ingresa un valor de descuento válido.'); return; }

  try {
    await enviarFormularioBackend('guardarDescuento', {
      sku_producto: skuProducto,
      sku_principal: tipo === 'cruzado' ? skuPrincipal : '',
      tipo_valor: tipoValor,
      valor: valor
    });
    alert('✅ Descuento creado.');
    document.getElementById('desc-producto').value = '';
    document.getElementById('desc-principal').value = '';
    document.getElementById('desc-valor').value = '';
    document.getElementById('desc-preview-box').classList.add('hidden');
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al crear el descuento: ' + err.message);
  }
}

async function eliminarDescuentoClick(idDescuento) {
  if (!confirm('¿Eliminar este descuento?')) return;
  try {
    await enviarFormularioBackend('eliminarDescuento', { id_descuento: idDescuento });
    await cargarDatosBackend();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// -----------------------------------------------------------------
// APLICACIÓN DE DESCUENTOS EN EL POS (venta real)
// -----------------------------------------------------------------

// Devuelve el descuento activo aplicable a un SKU, dado el contenido actual
// del carrito (el cruzado exige que el producto principal esté presente).
// El cruzado tiene prioridad sobre el unitario si ambos calzan.
function obtenerDescuentoAplicable(skuProducto, carritoActual) {
  const activos = listaDescuentosGlobal.filter(d => (d.activo || '').toLowerCase() !== 'no');
  const cruzado = activos.find(d => d.sku_producto === skuProducto && d.sku_principal &&
    carritoActual.some(i => i.codigo === d.sku_principal));
  if (cruzado) return cruzado;
  return activos.find(d => d.sku_producto === skuProducto && !d.sku_principal);
}

function calcularPrecioEfectivoItem(item, carritoActual) {
  const descuento = obtenerDescuentoAplicable(item.codigo, carritoActual);
  if (!descuento) return item.precio;
  return calcularPrecioConValorDescuento(item.precio, descuento.tipo_valor, Number(descuento.valor));
}

function calcularTotalCarritoConDescuentos(carritoActual) {
  return carritoActual.reduce((sum, i) => sum + calcularPrecioEfectivoItem(i, carritoActual) * i.cantidad, 0);
}

// Revisa si algún combo cruzado tiene su producto principal en el carrito
// pero le falta el producto complementario, y muestra el aviso al cajero.
function actualizarBannerCombo() {
  const banner = document.getElementById('banner-sugerencia-combo');
  if (!banner) return;

  const activos = listaDescuentosGlobal.filter(d => (d.activo || '').toLowerCase() !== 'no' && d.sku_principal);
  const sugerencia = activos.find(d =>
    carritoPOS.some(i => i.codigo === d.sku_principal) &&
    !carritoPOS.some(i => i.codigo === d.sku_producto)
  );

  if (!sugerencia) {
    banner.classList.add('hidden');
    return;
  }

  const productoDescontado = listaInventarioGlobal.find(p => (p.sku || p.codigo) === sugerencia.sku_producto);
  const precioOriginal = productoDescontado ? Number(productoDescontado.precio_venta || productoDescontado.precio || 0) : 0;
  const precioConDescuento = calcularPrecioConValorDescuento(precioOriginal, sugerencia.tipo_valor, Number(sugerencia.valor));
  const stockDisponible = productoDescontado ? Number(productoDescontado.stock || 0) : 0;

  banner.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
      <span>
        🏷️ <strong>Promoción activa</strong><br>
        Por la compra de <strong>${sugerencia.nombre_principal}</strong>, ¿agregar <strong>${sugerencia.nombre_producto}</strong> con descuento? Combo: <strong>$${precioConDescuento.toLocaleString('es-CL')}</strong> en vez de $${precioOriginal.toLocaleString('es-CL')}.
      </span>
      <button type="button" class="btn-primary" style="padding:6px 14px; font-size:0.85rem; white-space:nowrap;" onclick="agregarSugerenciaCombo('${sugerencia.sku_producto}')">✅ Sí, agregar</button>
    </div>
  `;
  banner.classList.remove('hidden');
}

function agregarSugerenciaCombo(skuProducto) {
  // Comparación con .toString() en ambos lados: el SKU puede llegar como
  // número desde Google Sheets, pero el botón del banner siempre lo pasa
  // como texto (viene de un atributo HTML). Sin esto, la comparación
  // estricta fallaba silenciosamente y el botón no hacía nada.
  const producto = listaInventarioGlobal.find(p => (p.sku || p.codigo || '').toString() === skuProducto.toString());
  if (!producto) return;
  agregarAlCarrito(producto.sku || producto.codigo, producto.nombre, Number(producto.precio_venta || producto.precio || 0), Number(producto.stock || 0), 1);
}

function formatearMoneda(valor) {
  return `$${Math.round(Number(valor) || 0).toLocaleString('es-CL')}`;
}

// Formatea un input de dinero mientras se escribe, mostrando separador de
// miles en vivo (ej. "1.234.567"), para que el cajero no tenga que contar
// ceros para verificar que el monto es correcto. El input debe ser type="text"
// (no "number", que no admite puntos como separador visual). Para leer el
// valor numérico real desde otro lado del código, usar obtenerValorNumerico().
function formatearInputMiles(elemento) {
  const soloDigitos = elemento.value.replace(/\D/g, '');
  elemento.value = soloDigitos === '' ? '' : Number(soloDigitos).toLocaleString('es-CL');
}

// Lee el valor numérico real de un input formateado con formatearInputMiles
// (quita los puntos separadores antes de convertir a número).
function obtenerValorNumerico(elementoOId) {
  const elemento = typeof elementoOId === 'string' ? document.getElementById(elementoOId) : elementoOId;
  if (!elemento) return 0;
  return Number(String(elemento.value).replace(/\D/g, '')) || 0;
}

// Formatea un input de teléfono chileno en vivo hacia "+56 9 XXXX XXXX"
// mientras se escribe, sin importar cómo el usuario empiece a tipear
// (con o sin +56, con o sin espacios).
function formatearTelefonoChile(elemento) {
  let digitos = elemento.value.replace(/\D/g, '');
  // Quita el "56" inicial si el usuario lo escribió como parte del número
  // (para no terminar con "+56 56 9...").
  if (digitos.startsWith('56')) digitos = digitos.substring(2);
  // Quita el "9" inicial del celular para reconstruirlo aparte, ya que el
  // formato siempre lo separa como "+56 9 XXXX XXXX".
  if (digitos.startsWith('9')) digitos = digitos.substring(1);
  digitos = digitos.substring(0, 8); // celular chileno: 8 dígitos después del 9

  let resultado = '+56 9';
  if (digitos.length > 0) resultado += ' ' + digitos.substring(0, 4);
  if (digitos.length > 4) resultado += ' ' + digitos.substring(4, 8);
  elemento.value = resultado;
}

function renderizarDashboard() {
  if (!datosDashboard) return;

  // --- KPIs ---
  const kpis = datosDashboard.kpis || {};
  setTexto('kpi-ingresos', formatearMoneda(kpis.ingresosTotales));
  setTexto('kpi-margen', formatearMoneda(kpis.margenTotalGeneral));
  setTexto('kpi-ticket', formatearMoneda(kpis.ticketPromedio));
  setTexto('kpi-numero-ventas', (kpis.numeroVentas || 0).toString());
  setTexto('kpi-unidades', (kpis.unidadesTotales || 0).toString());
  setTexto('kpi-valor-inventario', formatearMoneda(kpis.valorInventarioCosto));

  // --- Tablas ---
  llenarTablaDashboard('tabla-mas-vendidos-body', datosDashboard.masVendidos, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td>${p.unidades} u.</td>
    <td>${formatearMoneda(p.ingresos)}</td>
  `, 'Aún no hay ventas registradas en este período.');

  llenarTablaDashboard('tabla-mayor-margen-body', datosDashboard.mayorMargen, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td style="color:#1e8449; font-weight:bold;">${formatearMoneda(p.margenTotal)}</td>
    <td>${p.unidades} u.</td>
  `, 'Aún no hay ventas registradas en este período.');

  llenarTablaDashboard('tabla-rotacion-baja-body', datosDashboard.rotacionBaja, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td>${p.stock} u.</td>
    <td style="color:${p.unidadesVendidas === 0 ? '#e74c3c' : '#d68910'};">${p.unidadesVendidas} u.</td>
  `, 'No hay productos con rotación baja en este período. 🎉');

  llenarTablaDashboard('tabla-proximos-vencer-body', datosDashboard.proximosAVencer, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td>${p.stock} u.</td>
    <td style="color:${p.diasRestantes < 0 ? '#e74c3c' : '#d68910'};">${formatearFechaCorta(p.fechaVencimiento)} (${p.diasRestantes < 0 ? 'vencido' : p.diasRestantes + ' días'})</td>
  `, 'No hay productos próximos a vencer.');

  llenarTablaDashboard('tabla-candidatos-liquidar-body', datosDashboard.candidatosLiquidar, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td>${p.stock} u.</td>
    <td style="color:#d35400; font-weight:bold;">${formatearFechaCorta(p.fechaVencimiento)} (${p.diasRestantes < 0 ? 'vencido' : p.diasRestantes + ' días'})</td>
  `, 'Sin candidatos por ahora.');

  llenarTablaDashboard('tabla-stock-critico-body', datosDashboard.stockCritico, (p) => `
    <td><strong>${p.nombre || '-'}</strong><br><small style="color:#777;">${p.categoria || ''}</small></td>
    <td style="color:#e74c3c; font-weight:bold;">${p.stock} u.</td>
    <td>${p.stockCritico} u.</td>
  `, 'Sin productos en stock crítico. 🎉');

  llenarTablaDashboard('tabla-ranking-vendedores-body', datosDashboard.rankingVendedores, (v) => `
    <td><strong>${v.nombre || '-'}</strong></td>
    <td>${v.numeroVentas} venta(s)</td>
    <td>${formatearMoneda(v.ingresos)}</td>
  `, 'Sin ventas registradas en este período.');

  // --- Gráficos ---
  renderizarGraficoMasVendidos(datosDashboard.masVendidos);
  renderizarGraficoMetodoPago(datosDashboard.ventasPorMetodoPago);
}

function llenarTablaDashboard(idTbody, filas, construirFila, mensajeVacio) {
  const tbody = document.getElementById(idTbody);
  if (!tbody) return;

  if (!filas || filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#777;">${mensajeVacio}</td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(f => `<tr>${construirFila(f)}</tr>`).join('');
}

function formatearFechaCorta(fechaStr) {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr.toString().substring(0, 10) + 'T00:00:00');
  if (isNaN(fecha.getTime())) return fechaStr;
  return fecha.toLocaleDateString('es-CL');
}

function renderizarGraficoMasVendidos(masVendidos) {
  const canvas = document.getElementById('chart-mas-vendidos');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    mostrarErrorGrafico(canvas);
    return;
  }

  if (chartMasVendidos) chartMasVendidos.destroy();

  const datos = masVendidos && masVendidos.length > 0 ? masVendidos : [];
  chartMasVendidos = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: datos.map(p => p.nombre || '-'),
      datasets: [{
        label: 'Unidades vendidas',
        data: datos.map(p => p.unidades),
        backgroundColor: '#008080'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderizarGraficoMetodoPago(ventasPorMetodoPago) {
  const canvas = document.getElementById('chart-metodo-pago');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    mostrarErrorGrafico(canvas);
    return;
  }

  if (chartMetodoPago) chartMetodoPago.destroy();

  const datos = ventasPorMetodoPago && ventasPorMetodoPago.length > 0 ? ventasPorMetodoPago : [];
  chartMetodoPago = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: datos.map(m => m.metodo),
      datasets: [{
        data: datos.map(m => m.total),
        backgroundColor: ['#008080', '#2c3e50', '#d68910', '#8e44ad', '#c0392b']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// Si la librería de gráficos no cargó (ej. sin conexión a internet en ese momento),
// se muestra un aviso visible en vez de dejar el espacio en blanco sin explicación.
function mostrarErrorGrafico(canvas) {
  const contenedor = canvas.parentElement;
  if (!contenedor || contenedor.querySelector('.aviso-grafico-no-cargado')) return;
  const aviso = document.createElement('p');
  aviso.className = 'aviso-grafico-no-cargado';
  aviso.style.cssText = 'color:#c0392b; text-align:center; padding:20px;';
  aviso.innerText = '⚠️ No se pudo cargar el gráfico (revisa tu conexión a internet y recarga la página).';
  canvas.style.display = 'none';
  contenedor.appendChild(aviso);
}