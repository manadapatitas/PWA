// ============================================================================
// FRONTEND PWA - MANADA PATITAS (APP.JS COMPLETO)
// ============================================================================

const URL_BACKEND = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAATyuqBHUON3C17OW4SLBeRxoutLyYneHcFgfQ_Q4owqoGBCRESRclw/exec";

let datosGlobales = {
  tutores: [],
  agenda: [],
  clinica: []
};

document.addEventListener("DOMContentLoaded", function () {
  comprobarSesion();

  const inputFecha = document.getElementById("inputVerFecha");
  if (inputFecha) {
    inputFecha.value = obtenerFechaHoy();
    inputFecha.addEventListener("change", renderizarAgendaBloques);
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
      console.error("Error sesión:", e);
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

  const sessionData = {
    rol: rol,
    loggedIn: true,
    loginTime: new Date().getTime()
  };

  localStorage.setItem("manada_session", JSON.stringify(sessionData));
  mostrarAplicacion(rol);
}

window.procesarLogin = function (e) { iniciarSesion(e); };

function cerrarSesion() {
  localStorage.removeItem("manada_session");
  location.reload();
}

function mostrarAplicacion(rol) {
  document.getElementById("pantallaLogin").style.display = "none";
  document.getElementById("appMain").style.display = "block";
  document.getElementById("labelRolUsuario").textContent = rol;
  cargarDatosBackend();
}

function ocultarAplicacion() {
  document.getElementById("pantallaLogin").style.display = "flex";
  document.getElementById("appMain").style.display = "none";
}

function cambiarSeccion(nombreSeccion) {
  document.querySelectorAll(".seccion-app").forEach(sec => sec.style.display = "none");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  const seccion = document.getElementById(`seccion-${nombreSeccion}`);
  if (seccion) seccion.style.display = "block";

  if (event && event.target) event.target.classList.add("active");
}

function cargarDatosBackend() {
  fetch(`${URL_BACKEND}?action=obtenerTodo`)
    .then(res => res.json())
    .then(data => {
      if (data) {
        datosGlobales.tutores = data.tutores || [];
        datosGlobales.agenda = data.agenda || [];
        datosGlobales.clinica = data.clinica || [];

        poblarDesplegableTutoresModal();
        renderizarAgendaBloques();
      }
    })
    .catch(err => {
      console.error("Error al conectar con backend:", err);
      renderizarAgendaBloques();
    });
}

function renderizarAgendaBloques() {
  const contenedor = document.getElementById("contenedorBloquesAgenda");
  if (!contenedor) return;

  contenedor.innerHTML = "";
  const fechaSeleccionada = document.getElementById("inputVerFecha") ? document.getElementById("inputVerFecha").value : obtenerFechaHoy();

  const horas = [];
  for (let h = 9; h <= 19; h++) {
    const hh = h < 10 ? `0${h}` : `${h}`;
    horas.push(`${hh}:00`);
    horas.push(`${hh}:30`);
  }

  const citasDelDia = datosGlobales.agenda.filter(cita => String(cita.Fecha_Hora || cita.fecha).includes(fechaSeleccionada) && cita.Estado !== "Cancelado");

  horas.forEach(hora => {
    const cita = citasDelDia.find(c => String(c.Fecha_Hora || c.hora).includes(hora));

    const divBloque = document.createElement("div");
    divBloque.className = "bloque-horario";
    divBloque.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 5px; background-color: #ffffff; border-radius: 6px;";

    if (cita) {
      divBloque.style.backgroundColor = "#d9534f";
      divBloque.style.color = "#ffffff";
      divBloque.innerHTML = `
        <strong>⏰ ${hora} hrs</strong>
        <span>🐾 ${cita.Mascota || cita.paciente || "Mascota"} (${cita.Tutor || cita.tutor || "Tutor"})</span>
        <small style="background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px;">🚫 Reservado</small>
      `;
    } else {
      divBloque.innerHTML = `
        <strong>⏰ ${hora} hrs</strong>
        <span style="color: #10b981;">🟢 Disponible</span>
        <button type="button" class="btn-secundario" style="padding: 4px 10px; font-size: 12px;" onclick="agendarEnHora('${hora}')">+ Agendar</button>
      `;
    }

    contenedor.appendChild(divBloque);
  });
}

// ----------------------------------------------------------------------------
// MODAL DE AGENDAMIENTO
// ----------------------------------------------------------------------------
let horaSeleccionadaModal = "";

function agendarEnHora(hora) {
  horaSeleccionadaModal = hora;
  const fecha = document.getElementById("inputVerFecha").value;
  document.getElementById("modalFechaHora").value = `${fecha} ${hora}`;
  document.getElementById("modalAgendar").style.display = "flex";
}

function cerrarModal() {
  document.getElementById("modalAgendar").style.display = "none";
}

function poblarDesplegableTutoresModal() {
  const selectTutor = document.getElementById("selectTutorModal");
  if (!selectTutor) return;

  selectTutor.innerHTML = '<option value="">-- Selecciona un Tutor --</option>';
  datosGlobales.tutores.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.Nombre || t.RUT;
    opt.textContent = `${t.Nombre} (${t.RUT || "S/RUT"})`;
    opt.dataset.mascota = t.Mascota || "";
    selectTutor.appendChild(opt);
  });
}

function alSeleccionarTutorModal() {
  const selectTutor = document.getElementById("selectTutorModal");
  const selectMascota = document.getElementById("selectMascotaModal");
  if (!selectTutor || !selectMascota) return;

  const opt = selectTutor.options[selectTutor.selectedIndex];
  selectMascota.innerHTML = '<option value="">-- Selecciona Mascota --</option>';

  if (opt && opt.dataset.mascota) {
    const optM = document.createElement("option");
    optM.value = opt.dataset.mascota;
    optM.textContent = opt.dataset.mascota;
    selectMascota.appendChild(optM);
    selectMascota.value = opt.dataset.mascota;
  }
}

async function guardarCitaModal(e) {
  if (e) e.preventDefault();

  const fechaHora = document.getElementById("modalFechaHora").value;
  const tutor = document.getElementById("selectTutorModal").value;
  const mascota = document.getElementById("selectMascotaModal").value;
  const servicio = document.getElementById("selectServicioModal").value;

  if (!tutor || !mascota) {
    alert("⚠️ Selecciona el tutor y la mascota.");
    return;
  }

  const payload = {
    accion: "guardarCita",
    fecha: fechaHora,
    mascota: mascota,
    tutor: tutor,
    servicio: servicio
  };

  try {
    const res = await fetch(URL_BACKEND, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === "success") {
      alert("📅 Cita agendada exitosamente.");
      cerrarModal();
      cargarDatosBackend();
    } else {
      alert("⚠️ " + (data.message || "Error al guardar la cita."));
    }
  } catch (err) {
    alert("❌ Error de comunicación con la base de datos.");
    console.error(err);
  }
}

function obtenerFechaHoy() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
