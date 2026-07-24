// =================================================================
// FRONTEND PWA - MANADA PATITAS (APP.JS COMPLETO Y CORREGIDO)
// =================================================================

// ⚠️ IMPORTANTE: REEMPLAZA ESTA URL CON TU URL REAL DE GOOGLE APPS SCRIPT (debe terminar en /exec)
const URL_BACKEND = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec";

// Estado global de la aplicación
let datosGlobales = {
  tutores: [],
  agenda: [],
  clinica: []
};

// -----------------------------------------------------------------
// 1. GESTIÓN DE SESIÓN Y AUTENTICACIÓN (PERSISTENCIA CON F5 Y CTRL+F5)
// -----------------------------------------------------------------
window.addEventListener("DOMContentLoaded", function () {
  comprobarSesion();
  
  // Escuchar cambio de fecha en la agenda para re-renderizar bloques
  const inputFecha = document.getElementById("inputVerFecha");
  if (inputFecha) {
    inputFecha.addEventListener("change", actualizarVistaAgenda);
  }
});

function comprobarSesion() {
  try {
    const sessionRaw = localStorage.getItem("manada_session");
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      if (session && session.loggedIn) {
        ocultarPantallaLogin();
        inicializarAplicacion();
        return;
      }
    }
  } catch (e) {
    console.warn("Error leyendo sesión de localStorage:", e);
  }
  mostrarPantallaLogin();
}

function iniciarSesion() {
  const pinInput = document.getElementById("inputPin") ? document.getElementById("inputPin").value : "";
  const rolSelect = document.getElementById("selectRol") ? document.getElementById("selectRol").value : "Administrador";

  // Validación de PIN (permite ingreso con '1234' o cualquier clave de al menos 4 dígitos)
  if (pinInput === "1234" || pinInput.length >= 4) {
    const sessionData = {
      rol: rolSelect,
      loggedIn: true,
      loginTime: new Date().getTime()
    };
    
    localStorage.setItem("manada_session", JSON.stringify(sessionData));
    ocultarPantallaLogin();
    inicializarAplicacion();
  } else {
    alert("⚠️ PIN incorrecto. Ingresa tu PIN de acceso.");
  }
}

function cerrarSesion() {
  localStorage.removeItem("manada_session");
  location.reload();
}

function mostrarPantallaLogin() {
  const loginSec = document.getElementById("loginSection");
  const mainSec = document.getElementById("mainAppSection");
  if (loginSec) loginSec.classList.remove("hidden");
  if (mainSec) mainSec.classList.add("hidden");
}

function ocultarPantallaLogin() {
  const loginSec = document.getElementById("loginSection");
  const mainSec = document.getElementById("mainAppSection");
  if (loginSec) loginSec.classList.add("hidden");
  if (mainSec) mainSec.classList.remove("hidden");
}

// -----------------------------------------------------------------
// 2. CARGA DE DATOS DESDE GOOGLE SHEETS
// -----------------------------------------------------------------
async function inicializarAplicacion() {
  establecerFechaHoyInput();
  await cargarDatosDesdeBackend();
}

async function cargarDatosDesdeBackend() {
  if (!URL_BACKEND || URL_BACKEND.includes("TU_ID_DE_DESPLIEGUE_AQUI")) {
    console.warn("⚠️ Debes configurar URL_BACKEND en app.js con tu URL ejecutable de Apps Script.");
    return;
  }

  try {
    const response = await fetch(URL_BACKEND, {
      method: "POST",
      body: JSON.stringify({ accion: "obtenerTodo" })
    });

    const data = await response.json();
    datosGlobales.tutores = data.tutores || [];
    datosGlobales.agenda = data.agenda || [];
    datosGlobales.clinica = data.clinica || [];

    poblarDesplegableTutores();
    actualizarVistaAgenda();
  } catch (error) {
    console.error("Error al sincronizar datos con Google Sheets:", error);
  }
}

// -----------------------------------------------------------------
// 3. MÓDULO AGENDA & BLOQUEO DE HORARIOS
// -----------------------------------------------------------------
function establecerFechaHoyInput() {
  const inputFecha = document.getElementById("inputVerFecha");
  if (inputFecha && !inputFecha.value) {
    const hoy = new Date().toISOString().split("T")[0];
    inputFecha.value = hoy;
  }
}

function actualizarVistaAgenda() {
  const inputFecha = document.getElementById("inputVerFecha");
  const fechaSeleccionada = inputFecha ? inputFecha.value : "";
  if (!fechaSeleccionada) return;

  // Extraer las horas ocupadas comparando la fecha (soporta formatos de fecha/string de Google Sheets)
  const horasOcupadas = datosGlobales.agenda
    .filter(cita => {
      if (!cita.Fecha_Hora || cita.Estado === "Cancelado") return false;
      const strFechaHora = String(cita.Fecha_Hora).trim();
      return strFechaHora.startsWith(fechaSeleccionada) || strFechaHora.includes(fechaSeleccionada);
    })
    .map(cita => {
      const strFechaHora = String(cita.Fecha_Hora).trim();
      const partes = strFechaHora.split(" ");
      return partes.length > 1 ? partes[1].substring(0, 5) : "";
    });

  const bloques = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00"
  ];

  const contenedorBloques = document.getElementById("gridBloquesHorarios");
  if (!contenedorBloques) return;

  contenedorBloques.innerHTML = "";

  bloques.forEach(hora => {
    const btn = document.createElement("button");
    const estaOcupado = horasOcupadas.includes(hora);

    btn.type = "button";
    if (estaOcupado) {
      btn.className = "btn-bloque bloque-ocupado";
      btn.style.backgroundColor = "#d9534f";
      btn.style.color = "#ffffff";
      btn.style.borderColor = "#c9302c";
      btn.style.cursor = "not-allowed";
      btn.style.opacity = "0.85";
      btn.innerHTML = `⏰ ${hora}<br><small>🚫 Reservado</small>`;
      btn.disabled = true;
    } else {
      btn.className = "btn-bloque bloque-disponible";
      btn.innerHTML = `⏰ ${hora}<br><small>🟢 Disponible</small>`;
      btn.onclick = () => seleccionarBloque(fechaSeleccionada, hora);
    }

    contenedorBloques.appendChild(btn);
  });
}

function seleccionarBloque(fecha, hora) {
  const inputFechaHora = document.getElementById("inputFechaHoraSeleccionada");
  if (inputFechaHora) {
    inputFechaHora.value = `${fecha} ${hora}`;
  }
}

async function agendarCita() {
  const tutorSelect = document.getElementById("selectTutor");
  const mascotaSelect = document.getElementById("selectMascota");
  const fechaHoraInput = document.getElementById("inputFechaHoraSeleccionada");
  const servicioSelect = document.getElementById("selectServicio");

  if (!tutorSelect || !mascotaSelect || !fechaHoraInput || !servicioSelect) {
    alert("⚠️ Error en la interfaz: No se encontraron los campos del formulario.");
    return;
  }

  if (!tutorSelect.value || !mascotaSelect.value || !fechaHoraInput.value) {
    alert("⚠️ Por favor selecciona el Tutor, la Mascota y el Bloque de Horario abajo.");
    return;
  }

  const tutorTexto = tutorSelect.options[tutorSelect.selectedIndex].text;
  const mascotaTexto = mascotaSelect.value;
  const fechaHoraTexto = fechaHoraInput.value;
  const servicioTexto = servicioSelect.value;

  const payload = {
    accion: "guardarCita",
    fecha: fechaHoraTexto,
    mascota: mascotaTexto,
    tutor: tutorTexto,
    servicio: servicioTexto
  };

  try {
    const response = await fetch(URL_BACKEND, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (res.status === "success") {
      alert("📅 Cita agendada correctamente.");
      fechaHoraInput.value = "";
      await cargarDatosDesdeBackend(); // Refresca y bloquea el botón en rojo
    } else {
      alert("⚠️ " + res.message);
    }
  } catch (error) {
    alert("❌ Error al conectar con el servidor. Revisa tu conexión o la URL_BACKEND.");
    console.error(error);
  }
}

// -----------------------------------------------------------------
// 4. MÓDULO PACIENTES & TUTORES
// -----------------------------------------------------------------
function poblarDesplegableTutores() {
  const selectTutor = document.getElementById("selectTutor");
  if (!selectTutor) return;

  selectTutor.innerHTML = '<option value="">-- Selecciona un Tutor --</option>';

  datosGlobales.tutores.forEach(t => {
    const option = document.createElement("option");
    option.value = t.ID_Tutor || t.RUT;
    option.text = `${t.Nombre} (${t.RUT})`;
    option.dataset.mascota = t.Mascota;
    selectTutor.appendChild(option);
  });
}

function alSeleccionarTutor() {
  const selectTutor = document.getElementById("selectTutor");
  const selectMascota = document.getElementById("selectMascota");
  if (!selectTutor || !selectMascota) return;

  const selectedOption = selectTutor.options[selectTutor.selectedIndex];
  selectMascota.innerHTML = '<option value="">-- Selecciona Mascota --</option>';

  if (selectedOption && selectedOption.dataset.mascota) {
    const option = document.createElement("option");
    option.value = selectedOption.dataset.mascota;
    option.text = selectedOption.dataset.mascota;
    selectMascota.appendChild(option);
    selectMascota.value = selectedOption.dataset.mascota;
  }
}

async function registrarPaciente() {
  const rut = document.getElementById("inputRut")?.value;
  const tutor = document.getElementById("inputNombreTutor")?.value;
  const telefono = document.getElementById("inputTelefono")?.value;
  const mascota = document.getElementById("inputNombreMascota")?.value;
  const raza = document.getElementById("inputRaza")?.value;
  const edad = document.getElementById("inputEdad")?.value;
  const peso = document.getElementById("inputPeso")?.value;

  if (!rut || !tutor || !mascota) {
    alert("⚠️ Completa al menos RUT, Nombre del Tutor y Nombre de la Mascota.");
    return;
  }

  const payload = {
    accion: "guardarPaciente",
    rut: rut,
    tutor: tutor,
    telefono: telefono,
    mascota: mascota,
    raza: raza,
    edad: edad,
    peso: peso
  };

  try {
    const response = await fetch(URL_BACKEND, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (res.status === "success") {
      alert("🐾 Paciente guardado correctamente.");
      limpiarFormularioPaciente();
      await cargarDatosDesdeBackend();
    } else {
      alert("⚠️ " + res.message);
    }
  } catch (error) {
    alert("❌ Error al registrar el paciente.");
    console.error(error);
  }
}

function limpiarFormularioPaciente() {
  ["inputRut", "inputNombreTutor", "inputTelefono", "inputNombreMascota", "inputRaza", "inputEdad", "inputPeso"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// -----------------------------------------------------------------
// 5. NAVEGACIÓN POR PESTAÑAS
// -----------------------------------------------------------------
function cambiarPestana(idPestana) {
  const pestañas = document.querySelectorAll(".seccion-modulo");
  pestañas.forEach(p => p.classList.add("hidden"));

  const seleccionada = document.getElementById(idPestana);
  if (seleccionada) {
    seleccionada.classList.remove("hidden");
  }
}

// Alias para evitar el error del HTML
window.procesarLogin = function(e) {
  if (e) e.preventDefault();
  iniciarSesion(e);
};
