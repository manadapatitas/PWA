// =================================================================
// FRONTEND PWA - MANADA PATITAS (APP.JS COMPLETO)
// =================================================================

// ⚠️ REEMPLAZA ESTA URL CON LA URL DE TU WEB APP DE GOOGLE APPS SCRIPT
const URL_BACKEND = "TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI";

// Estado global de la aplicación
let datosGlobales = {
  tutores: [],
  agenda: [],
  clinica: []
};

// -----------------------------------------------------------------
// 1. GESTIÓN DE SESIÓN Y AUTENTICACIÓN (PERSISTENCIA CON F5)
// -----------------------------------------------------------------
window.addEventListener("DOMContentLoaded", function () {
  comprobarSesion();
});

function comprobarSesion() {
  const session = JSON.parse(localStorage.getItem("manada_session"));
  
  if (session && session.loggedIn) {
    ocultarPantallaLogin();
    inicializarAplicacion();
  } else {
    mostrarPantallaLogin();
  }
}

function iniciarSesion() {
  const pinInput = document.getElementById("inputPin").value;
  const rolSelect = document.getElementById("selectRol").value;

  // Validación de PIN básico (puedes ajustar según tu lógica)
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
    alert("⚠️ PIN incorrecto. Inténtalo de nuevo.");
  }
}

function cerrarSesion() {
  localStorage.removeItem("manada_session");
  location.reload();
}

function mostrarPantallaLogin() {
  document.getElementById("loginSection")?.classList.remove("hidden");
  document.getElementById("mainAppSection")?.classList.add("hidden");
}

function ocultarPantallaLogin() {
  document.getElementById("loginSection")?.classList.add("hidden");
  document.getElementById("mainAppSection")?.classList.remove("hidden");
}

// -----------------------------------------------------------------
// 2. CARGA DE DATOS DESDE GOOGLE SHEETS
// -----------------------------------------------------------------
async function inicializarAplicacion() {
  establecerFechaHoyInput();
  await cargarDatosDesdeBackend();
}

async function cargarDatosDesdeBackend() {
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
    console.error("Error al cargar datos desde el backend:", error);
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
  const fechaSeleccionada = document.getElementById("inputVerFecha")?.value;
  if (!fechaSeleccionada) return;

  const bloques = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00"
  ];

  // Extraer las horas agendadas para la fecha actual (evita horas pasadas o duplicadas)
  const horasOcupadas = datosGlobales.agenda
    .filter(cita => {
      if (!cita.Fecha_Hora || cita.Estado === "Cancelado") return false;
      return cita.Fecha_Hora.startsWith(fechaSeleccionada);
    })
    .map(cita => cita.Fecha_Hora.split(" ")[1]);

  const contenedorBloques = document.getElementById("gridBloquesHorarios");
  if (!contenedorBloques) return;

  contenedorBloques.innerHTML = "";

  bloques.forEach(hora => {
    const btn = document.createElement("button");
    const estaOcupado = horasOcupadas.includes(hora);

    btn.type = "button";
    if (estaOcupado) {
      btn.className = "btn-bloque bloque-ocupado";
      btn.innerHTML = `⏰ ${hora}<br><small>🚫 Ocupado</small>`;
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

  if (!tutorSelect.value || !mascotaSelect.value || !fechaHoraInput.value) {
    alert("⚠️ Por favor completa el Tutor, la Mascota y el Bloque de Horario.");
    return;
  }

  // Extraer Nombre y RUT
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
    alert("❌ Error al agendar la cita. Revisa la conexión.");
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
    alert("❌ Error al registrar paciente.");
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
