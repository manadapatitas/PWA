// ============================================================================
// FRONTEND PWA - MANADA PATITAS (APP.JS COMPLETO)
// ============================================================================

// URL DEL BACKEND EN GOOGLE APPS SCRIPT
const URL_BACKEND = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAATyuqBHUON3C17OW4SLBeRxoutLyYneHcFgfQ_Q4owqoGBCRESRclw/exec";

// Estado global de la aplicación
let datosGlobales = {
  tutores: [],
  agenda: [],
  clinica: []
};

// ----------------------------------------------------------------------------
// 1. INICIALIZACIÓN Y GESTIÓN DE SESIÓN
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  comprobarSesion();

  // Escuchar cambio de fecha en la agenda para re-renderizar bloques
  const inputFecha = document.getElementById("inputVerFecha");
  if (inputFecha) {
    inputFecha.value = obtenerFechaHoy();
    inputFecha.addEventListener("change", function () {
      renderizarAgendaBloques();
    });
  }
});

function comprobarSesion() {
  const sessionRaw = localStorage.getItem("manada_session");
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      if (session && session.loggedIn) {
        mostrarAplicacion(session.rol);
        return;
      }
    } catch (e) {
      console.error("Error al leer sesión local:", e);
    }
  }
  ocultarAplicacion();
}

function iniciarSesion(event) {
  if (event) event.preventDefault();

  const selectRol = document.getElementById("selectRol");
  const inputPin = document.getElementById("inputPin");

  const rol = selectRol ? selectRol.value : "Administrador";
  const pin = inputPin ? inputPin.value.trim() : "";

  if (pin.length < 1) {
    alert("⚠️ Por favor ingresa tu PIN de acceso.");
    return;
  }

  // Guardar sesión en localStorage
  const sessionData = {
    rol: rol,
    loggedIn: true,
    loginTime: new Date().getTime()
  };

  localStorage.setItem("manada_session", JSON.stringify(sessionData));
  mostrarAplicacion(rol);
}

// Alias global para compatibilidad
window.procesarLogin = function (e) {
  iniciarSesion(e);
};

function cerrarSesion() {
  localStorage.removeItem("manada_session");
  location.reload();
}

function mostrarAplicacion(rol) {
  const pantallaLogin = document.getElementById("pantallaLogin");
  const appMain = document.getElementById("appMain");
  const labelRol = document.getElementById("labelRolUsuario");

  if (pantallaLogin) pantallaLogin.style.display = "none";
  if (appMain) appMain.style.display = "block";
  if (labelRol) labelRol.textContent = rol;

  // Cargar datos desde el backend
  cargarDatosBackend();
}

function ocultarAplicacion() {
  const pantallaLogin = document.getElementById("pantallaLogin");
  const appMain = document.getElementById("appMain");

  if (pantallaLogin) pantallaLogin.style.display = "flex";
  if (appMain) appMain.style.display = "none";
}

// ----------------------------------------------------------------------------
// 2. NAVEGACIÓN ENTRE SECCIONES
// ----------------------------------------------------------------------------
function cambiarSeccion(nombreSeccion) {
  const secciones = document.querySelectorAll(".seccion-app");
  secciones.forEach(sec => sec.style.display = "none");

  const botones = document.querySelectorAll(".nav-btn");
  botones.forEach(btn => btn.classList.remove("active"));

  const seccionObjetivo = document.getElementById(`seccion-${nombreSeccion}`);
  if (seccionObjetivo) {
    seccionObjetivo.style.display = "block";
  }

  // Activar botón seleccionado
  if (event && event.target) {
    event.target.classList.add("active");
  }
}

// ----------------------------------------------------------------------------
// 3. COMUNICACIÓN CON EL BACKEND (APPS SCRIPT)
// ----------------------------------------------------------------------------
function cargarDatosBackend() {
  fetch(`${URL_BACKEND}?action=obtenerTodo`)
    .then(response => response.json())
    .then(data => {
      if (data) {
        datosGlobales.tutores = data.tutores || [];
        datosGlobales.agenda = data.agenda || [];
        datosGlobales.clinica = data.clinica || [];

        renderizarAgendaBloques();
      }
    })
    .catch(error => {
      console.error("Error al sincronizar con el backend:", error);
      // Igualmente renderizamos bloques vacíos para permitir trabajar
      renderizarAgendaBloques();
    });
}

// ----------------------------------------------------------------------------
// 4. RENDERIZADO DE AGENDA Y BLOQUES
// ----------------------------------------------------------------------------
function renderizarAgendaBloques() {
  const contenedor = document.getElementById("contenedorBloquesAgenda");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  const fechaSeleccionada = document.getElementById("inputVerFecha") ? 
                            document.getElementById("inputVerFecha").value : 
                            obtenerFechaHoy();

  // Generar bloques de media hora desde las 09:00 hasta las 19:30
  const horas = [];
  for (let h = 9; h <= 19; h++) {
    const horaFormateada = h < 10 ? `0${h}` : `${h}`;
    horas.push(`${horaFormateada}:00`);
    horas.push(`${horaFormateada}:30`);
  }

  // Filtrar citas del día seleccionado
  const citasDelDia = datosGlobales.agenda.filter(cita => cita.fecha === fechaSeleccionada);

  horas.forEach(hora => {
    const cita = citasDelDia.find(c => c.hora === hora);

    const divBloque = document.createElement("div");
    divBloque.className = "bloque-horario";
    divBloque.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 5px; background-color: #f9fafb; border-radius: 6px;";

    if (cita) {
      divBloque.style.backgroundColor = "#fe2c55"; // Fondo rojo para citas agendadas
      divBloque.style.color = "#ffffff";
      divBloque.innerHTML = `
        <strong>${hora} hrs</strong>
        <span>🐾 ${cita.paciente || "Mascota"} (${cita.tutor || "Tutor"}) - ${cita.servicio || "Atención"}</span>
        <small style="background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">Reservado</small>
      `;
    } else {
      divBloque.innerHTML = `
        <strong style="color: #374151;">${hora} hrs</strong>
        <span style="color: #9ca3af; font-style: italic;">Disponible</span>
        <button class="btn-secundario" style="padding: 4px 10px; font-size: 12px;" onclick="agendarEnHora('${hora}')">+ Agendar</button>
      `;
    }

    contenedor.appendChild(divBloque);
  });
}

function agendarEnHora(hora) {
  const fecha = document.getElementById("inputVerFecha").value;
  alert(`Iniciando reserva para el día ${fecha} a las ${hora} hrs.`);
}

// ----------------------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------------------
function obtenerFechaHoy() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
