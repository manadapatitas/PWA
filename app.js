// =================================================================
// FRONTEND APP.JS - MANADA PATITAS PWA (COMPLETO Y ACTUALIZADO)
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

document.addEventListener('DOMContentLoaded', () => {
  inicializarAutenticacion();
  configurarFechaPorDefecto();
  mostrarModalLogin();
});

// -----------------------------------------------------------------
// AUTENTICACIÓN Y GESTIÓN DE ROLES
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

function procesarLogin(e) {
  if (e) e.preventDefault();
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
// NAVEGACIÓN Y CONFIGURACIÓN
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
  }
}

function configurarFechaPorDefecto() {
  const hoy = new Date().toISOString().split('T')[0];
  const inputFiltro = document.getElementById('filtro-fecha-agenda');
  if (inputFiltro) inputFiltro.value = hoy;
}

// -----------------------------------------------------------------
// CONEXIÓN CON BACKEND (GOOGLE APPS SCRIPT)
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
    cargarDatosMascotaSeleccionada();
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

// TUTORES Y PACIENTES
function poblarCombosTutores() {
  const selectsTutor = [
    document.getElementById('age-select-tutor'),
    document.getElementById('cli-select-tutor')
  ];

  const tutoresMap = new Map();
  listaPacientesGlobal.forEach(p => {
    const r = formatearRutChile(p.rut || p.RUT);
    const n = p.tutor || p.Tutor || p.nombre || p.Nombre || 'Sin Nombre';
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

async function guardarTutor(e) {
  if (e) e.preventDefault();
  const rutVal = document.getElementById('tut-rut').value;
  const nomVal = document.getElementById('tut-nombre').value;
  const telVal = document.getElementById('tut-telefono').value;
  const masVal = document.getElementById('tut-mascota').value;
  const razVal = document.getElementById('tut-raza').value;
  const edaVal = document.getElementById('tut-edad').value;

  if (!rutVal || !nomVal || !masVal) {
    alert("Ingresa RUT, Nombre del tutor y Nombre de la mascota.");
    return;
  }

  const payload = {
    rut: rutVal,
    tutor: nomVal,
    telefono: telVal,
    mascota: masVal,
    especie: razVal,
    raza: razVal,
    edad: edaVal
  };

  try {
    const res = await enviarFormularioBackend('guardarPaciente', payload);
    alert('🐾 ' + res.message);
    document.getElementById('form-tutor').reset();
    await cargarDatosBackend();
  } catch (err) {
    alert('⚠️ Error al registrar tutor: ' + err.message);
  }
}

// AGENDA
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
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita">🟢 Disponible</div>`;
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

  const fechaHoraNormalizada = normalizarFechaHoraCita(fechaInput);
  const yaOcupado = listaCitasGlobal.some(c => {
    const raw = c.fecha_hora || c.Fecha_Hora || c.fecha || c.Fecha || '';
    return normalizarFechaHoraCita(raw) === fechaHoraNormalizada;
  });

  if (yaOcupado) {
    alert("⚠️ Este horario ya se encuentra reservado. Selecciona otro bloque disponible.");
    await cargarDatosBackend();
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
    await cargarDatosBackend();
  }
}

// CONSULTA CLÍNICA
function actualizarMascotasClinica() {
  const rutSeleccionado = document.getElementById('cli-select-tutor').value;
  const selectMascota = document.getElementById('cli-select-mascota');
  if (!selectMascota) return;

  if (!rutSeleccionado) {
    selectMascota.innerHTML = '<option value="">-- Selecciona primero un Tutor --</option>';
    selectMascota.disabled = true;
    limpiarHistorialClinicoPaciente();
    return;
  }

  const mascotasTutor = listaPacientesGlobal.filter(p => formatearRutChile(p.rut || p.RUT) === rutSeleccionado);
  selectMascota.innerHTML = '<option value="">-- Selecciona una Mascota --</option>';
  mascotasTutor.forEach(p => {
    const nombre = p.mascota || p.Mascota || 'Mascota';
    selectMascota.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  selectMascota.disabled = false;
  limpiarHistorialClinicoPaciente();
}

function cargarDatosMascotaSeleccionada() {
  const rutSeleccionado = document.getElementById('cli-select-tutor').value;
  const mascotaNombre = document.getElementById('cli-select-mascota').value;
  const banner = document.getElementById('cli-info-paciente');

  if (!rutSeleccionado || !mascotaNombre) {
    if (banner) banner.classList.add('hidden');
    limpiarHistorialClinicoPaciente();
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

function limpiarHistorialClinicoPaciente() {
  const contenedor = document.getElementById('contenedor-historial-clinico');
  if (contenedor) {
    contenedor.innerHTML = '<p style="color:#777;">Selecciona un tutor y una mascota para ver su historial médico particular.</p>';
  }
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
    cargarDatosMascotaSeleccionada();
  } catch (err) {
    alert('Error al guardar atención: ' + err);
  }
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
    
    const matchRut = rutCLLimpio.includes(rutLimpioSeleccionado) || rutLimpioSeleccionado.includes(rutCLLimpio);
    const matchMascota = mascotaC === nombreMascota.trim().toLowerCase();

    return matchRut && matchMascota;
  });

  if (atencionesMascota.length === 0) {
    contenedor.innerHTML = '<p style="color:#777;">Este paciente no registra consultas médicas anteriores.</p>';
    return;
  }

  [...atencionesMascota].reverse().forEach(c => {
    const card = document.createElement('div');
    card.className = 'card-historial';
    const fechaAtencion = c.Fecha || c.fecha || '-';
    const tempAtencion = c.Temperatura || c.temperatura || '-';
    const pesoAtencion = c.Peso || c.peso || '-';
    const diagAtencion = c.Diagnostico || c.diagnostico || '-';
    const recAtencion = c.Receta || c.receta || '-';
    const mascotaAtencion = c.Mascota || c.mascota || nombreMascota;

    card.innerHTML = `
      <div style="font-size:0.85rem; color:#666;">📅 ${fechaAtencion} | 🐾 <strong>${mascotaAtencion}</strong></div>
      <div><strong>🌡️ Temp:</strong> ${tempAtencion} °C | <strong>⚖️ Peso:</strong> ${pesoAtencion} kg</div>
      <div><strong>🩺 Diagnóstico:</strong> ${diagAtencion}</div>
      <div><strong>💊 Tratamiento / Receta:</strong> ${recAtencion}</div>
    `;
    contenedor.appendChild(card);
  });
}
