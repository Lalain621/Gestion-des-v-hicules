// ==UserScript==
// @name         Paramètres géneraux Véhicules
// @version      Lalain
// @description  Ce script permet de modifier en masse les paramètres de configuration des véhicules dans le jeu Opérateur 112 (ainsi que ses déclinaisons comme la version Police). Il simplifie la gestion des réglages spécifiques pour chaque type de véhicule.
// @author       Lalain
// @license      BSD-3-Clause
// @match        https://www.operateur112.fr/
// @match        https://police.operateur112.fr/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leitstellenspiel.de
// @grant        GM_addStyle
// ==/UserScript==
//* global $, I18n, GM_addStyle, GM_info */
//Fonctionnalités principales :
//Interface utilisateur graphique (modale) pour ajuster les paramètres.
//Filtrage par type de véhicule : sélection d’un ou plusieurs types spécifiques à modifier.
//Paramétrage automatique des hôpitaux pour les ambulances : Distance maximale,Tarif accepté,Nombre de lits libres requis,Compatibilité avec l’extension du bâtiment.
//Configuration générale : Nombre d’équipiers, Délais de départ, Heure de début et de fin de service, Nom de la catégorie personnalisée du véhicule,Ignorer ou non la régulation AAO.
//Modification groupée : tous les véhicules sélectionnés peuvent être mis à jour en une seule opération.
//Barre de progression visuelle de la mise à jour.
"use strict";

(async function () {
  const t = (translateString, options) => I18n.translate(`vehicleChanges.${translateString}`, options);

  /* --------------------------------------------------
   *               FR UNIQUEMENT
   * -------------------------------------------------- */
  I18n.translations.fr_FR.vehicleChanges = {
    ids: {
      segLeader: [29]
    },
    close: "Fermer",
    title: "Paramétrage globale des véhicules",
    tabs: {
      segLeader: "Paramètrage DSM",
      GeneralSettings: "Paramètres"
    },
    settingsForAll: "%{category}",
    setSettings: "Tout sauvegarder",
    settings: {
      segLeader: {
        hospital_automatic: {
          title: "Assigner automatiquement les ambulances aux hopîtaux",
          type: "checkbox",
        },
        hospital_own: {
          title: "Transporter uniquement dans un établissement possédé",
          type: "checkbox",
          dependsOn: "hospital_automatic"
        },
        hospital_right_building_extension: {
          title: "Transporter uniquement dans un établissement compatible",
          type: "checkbox",
          dependsOn: "hospital_automatic"
        },
        hospital_max_price: {
          title: "Taxe maximum acceptée",
          type: "select",
          options: [
            { value: 0, label: "0 %" },
            { value: 10, label: "10 %" },
            { value: 20, label: "20 %" },
            { value: 30, label: "30 %" },
            { value: 40, label: "40 %" },
            { value: 50, label: "50 %" },
          ],
          dependsOn: "hospital_automatic"
        },
        hospital_max_distance: {
          title: "Distance maximum de l'hôpital",
          type: "select",
          options: [
            { value: 1, label: "1 km" },
            { value: 5, label: "5 km" },
            { value: 20, label: "20 km" },
            { value: 50, label: "50 km" },
            { value: 100, label: "100 km" },
            { value: 200, label: "200 km" },
          ],
          dependsOn: "hospital_automatic"
        },
        hospital_free_space: {
          title: "Nombre de lits en réserve",
          type: "select",
          options: [
            { value: 0, label: "0" },
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
            { value: 5, label: "5" },
          ],
          dependsOn: "hospital_automatic"
        },
      },
    },
    GeneralSettings: {
      personal_max: {
        title: "Nombre max. d’équipiers",
        type: "select",
        options: [],
      },
      start_delay: {
        title: "Temps de réponse (Temps en secondes)",
        type: "number",
      },
      ignore_aao: {
        title: "Exclure de la Régulation d’alertes et d’interventions",
        type: "checkbox",
      },
      working_hour_start: {
        title: "Service - heure de début",
        type: "select",
        options: new Array(24).fill().map((_, i) => ({ value: i, label: `${i}:00` })),
      },
      working_hour_end: {
        title: "Service - heure de fin",
        type: "select",
        options: new Array(24).fill().map((_, i) => ({ value: i, label: `${i}:00` })),
      },
      vehicle_type_caption: {
        title: "Catégorie de véhicule propre",
        type: "text",
      },
      vehicle_type_ignore_default_aao: {
        title: "Déployer ce véhicule uniquement en tant que sa propre catégorie. (Si cette option est activée, le véhicule sera uniquement déployé en tant que classe personnalisée. Si vous souhaitez aussi le déployer sous sa classe d’origine, ne cochez pas cette option)",
        type: "checkbox",
      },
    },
    GeneralSettingsVehicleSelection: "Sélectionner un type de véhicule",
    GeneralSettingsDescription: "Sélectionnez les paramètres que vous voulez changer. Cette fonction ne changera que les véhicules dont les paramètres sont différents de ceux sélectionnés. Seul le paramétrage 'Déployer ce véhicule uniquement en tant que sa propre catégorie' modifiera tous les véhicules car la donnée n'est pas accessible"
  };

  /* --------------------------------------------------
   *  Variables et structures de travail
   * -------------------------------------------------- */
  let aVehicles = [];
  let vehicleTypes = [];
  const category = {
    segLeader: [],
    container: [],
    grtw: [],
    ovdp: [],
    waterBin: [],
  };

  /* --------------------------------------------------
   *  Chargement des données via l'API interne
   * -------------------------------------------------- */
  async function loadApi() {
    const ids = Object.entries(t("ids"));

    vehicleTypes = await $.getJSON(`https://api.lss-manager.de/${I18n.locale}/vehicles.json`);
    aVehicles = await $.getJSON("/api/vehicles");
    for (const i in aVehicles) {
      const e = aVehicles[i];
      ids.forEach(([key, value]) => {
        if (value.includes(e.vehicle_type)) category[key].push(e);
      });
    }
  }

  /* --------------------------------------------------
   *  Style custom pour la modale
   * -------------------------------------------------- */
  GM_addStyle(`.modal {
    display: none;
    position: fixed;
    padding-top: 100px;
    left: 0;
    right:0;
    top: 0;
    bottom: 0;
    overflow: auto;
    background-color: rgba(0,0,0,0.4);
    z-index: 9999;
  }
  .modal-body{
    height: 650px;
    overflow-y: auto;
  }`);

  /* --------------------------------------------------
   *  Insertion de la modale dans le DOM
   * -------------------------------------------------- */
  $("body").prepend(`
    <div class="modal fade bd-example-modal-lg" id="veChModal" tabindex="-1" role="dialog" aria-labelledby="myLargeModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&#x274C;</span>
            </button>
            <h3 class="modal-title"><center>${t("title")}</center></h3>
            <div class="btn-group hidden" id="veChBtnGrp">
              ${Object.entries(t("ids")).map(([key]) => `<a class="btn btn-warning btn-xs" id="veChBtn${key}">${t(`tabs.${key}`)}</a>`).join("")}
              <a class="btn btn-warning btn-xs" id="veChBtnGeneralSettings">${t(`tabs.GeneralSettings`)}</a>
            </div>
          </div>
          <div class="modal-body" id="veChModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-danger" data-dismiss="modal">${t("close")}</button>
            <div class="pull-left">v ${GM_info.script.version}</div>
          </div>
        </div>
      </div>
    </div>`);

  /* --------------------------------------------------
   *  Ajout du lien dans le menu profil
   * -------------------------------------------------- */
  $("ul .dropdown-menu[aria-labelledby='menu_profile'] >> a[href*='peed']")
    .parent()
    .after(`<li role="presentation"><a data-toggle="modal" data-target="#veChModal" style="cursor:pointer" id="veChOpenModal"><span class="glyphicon glyphicon-cog"></span> ${t("title")}</a></li>`);

  /* --------------------------------------------------
   *  Fonction de progression de sauvegarde
   * -------------------------------------------------- */
  async function progress(type) {
    let vehiclesToSet = type !== "GeneralSettings" ? category[type] : aVehicles.filter((a) => a.vehicle_type === parseInt($("#GeneralSettingsVehicleSelection").val()));
    const postContent = {};
    let count = 0;

    if (type !== "GeneralSettings") {
      Object.entries(t(`settings.${type}`)).forEach(([key, { type: settingType, category }]) => {
        if (category) {
          let cat = key;
          postContent[cat] = {};
          Object.entries(t(`settings.${type}.${cat}`))
            .filter(([key]) => key !== "category")
            .forEach(([key, { type: settingType }]) => {
              postContent[cat][key] = settingType === "checkbox" ? $(`#${type}${key}`)[0].checked ? 1 : 0
                : settingType === "select" ? $(`#${type}${key}`).val()
                : settingType === "number" ? isNaN(parseInt($(`#${type}${key}`).val())) ? null : parseInt($(`#${type}${key}`).val())
                : "";
            });
        } else {
          postContent[key] = settingType === "checkbox" ? $(`#${type}${key}`)[0].checked ? 1 : 0
            : settingType === "select" ? $(`#${type}${key}`).val()
            : settingType === "number" ? isNaN(parseInt($(`#${type}${key}`).val())) ? null : parseInt($(`#${type}${key}`).val())
            : "";
        }
      });
    } else {
      Object.entries(t(`GeneralSettings`)).forEach(([key, { type: settingType }]) => {
        if ($(`#${type}active${key}`)[0].checked) {
          postContent[key] = settingType === "checkbox" ? $(`#${type}${key}`)[0].checked ? 1 : 0
            : settingType === "select" ? $(`#${type}${key}`).val()
            : settingType === "number" ? parseInt($(`#${type}${key}`).val())
            : settingType === "text" ? $(`#${type}${key}`).val()
            : "";
        }
      });
      vehiclesToSet = vehiclesToSet.filter((a) => Object.entries(postContent).some(([key, value]) =>
        key === "vehicle_type_ignore_default_aao" ||
        key === "personal_max" && postContent[key] != a.max_personnel_override ||
        key === "start_delay" && a.alarm_delay != postContent[key] ||
        key === "ignore_aao" && a[key] != postContent[key] ||
        key === "working_hour_start" && a[key] != postContent[key] ||
        key === "working_hour_end" && a[key] != postContent[key] ||
        key === "vehicle_type_caption" && a[key] != postContent[key]
      ));
    }

    $("#veChModalBody").append(`<div class="progress" style="margin-top:2em"><div class="progress-bar bg-success" role="progressbar" style="width: ${vehiclesToSet.length === 0 ? "100" : "0"}%;color: black" aria-valuenow="0" aria-valuemin="0" aria-valuemax="${vehiclesToSet.length}" id="veChPrgs">0 / ${vehiclesToSet.length.toLocaleString()}</div></div>`);

    for (const i in vehiclesToSet) {
      count++;
      const percent = Math.round(count / vehiclesToSet.length * 100);
      const e = vehiclesToSet[i];
      $("#veChPrgs")
        .attr("aria-valuenow", count)
        .css({ "width": percent + "%" })
        .text(count.toLocaleString() + " / " + vehiclesToSet.length.toLocaleString());
      await $.post("/vehicles/" + e.id, { "vehicle": postContent, "authenticity_token": $("meta[name=csrf-token]").attr("content"), "_method": "put" });
      if (type === "GeneralSettings" && count === vehiclesToSet.length) await loadApi();
      if (type === "GeneralSettings" && count === vehiclesToSet.length) setTimeout(() => { $("#veChBtnGeneralSettings").click(); }, 3000);
    }
    if (type === "GeneralSettings" && vehiclesToSet.length === 0) setTimeout(() => { $("#veChBtnGeneralSettings").click(); }, 3000);
  }

  /* --------------------------------------------------
   *  Ouverture de la modale : chargement des données
   * -------------------------------------------------- */
  $("body").on("click", "#veChOpenModal", async function () {
    if (!$("#veChBtnGrp").hasClass("hidden")) $("#veChBtnGrp").addClass("hidden");
    Object.keys(category).forEach((key) => category[key] = []);
    await loadApi();
    $("#veChBtnGrp").removeClass("hidden");
  });

  /*
   * --------------------------------------------------
   *  Gestion des onglets & logique d'interface
   * --------------------------------------------------
   *  La logique complète est conservée afin de garantir le bon
   *  fonctionnement du script.
   * --------------------------------------------------
   */

  const settings = t(`GeneralSettings`);
  $("body").on("click", `#veChBtnGeneralSettings`, function () {
    let key = "GeneralSettings";
    $("#veChModalBody").html(`<h4>${t(`tabs.${key}`)}</h4><div><label for="GeneralSettingsVehicleSelection">${t("GeneralSettingsVehicleSelection")}</label><br><select class="custom-select" id="GeneralSettingsVehicleSelection">${[["", { caption: "" }], ...Object.entries(vehicleTypes)].map(([value, { caption: label }], i) => `<option ${i === 0 ? "selected" : ""} value="${value}">${label}</option>`).join("")}</select></div><div id="GeneralSettingsTableDiv"/><br><a class="btn btn-success" id="veChSaveAll" bullet_point="${key}" style="margin-top:2em">${t("setSettings")}</a>`);
  });

  $("body").on("change", `#GeneralSettingsVehicleSelection`, function () {
    const type = $("#GeneralSettingsVehicleSelection").val();
    const vehicle = vehicleTypes[type];
    if (!vehicle) return;
    let options = [];
    for (let i = vehicle.minPersonnel; i <= vehicle.maxPersonnel; i++) options.push({ value: i, label: i });
    settings.personal_max.options = options;

    let key = "GeneralSettings";
    $("#GeneralSettingsTableDiv").html(`<div>${t("GeneralSettingsDescription")}</div><table id="GeneralSettingsTable" class="table table-striped"><tbody>${Object.entries(settings).map(([settingKey, { title, type, options, dependsOn }]) => `<tr><td><div class="form-check"><input class="form-check-input" type="checkbox" value="" id="${key}active${settingKey}"></div></td><td>${type === "checkbox" ? `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" disabled="true" type="checkbox" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>` : type === "select" ? `<div${dependsOn ? " class=\"hidden\"" : ""}><label for="${key}${settingKey}">${title}</label><br><select class="custom-select" disabled="true" id="${key}${settingKey}">${options.map(({ label, value }, i) => `<option ${i === 0 ? "selected" : ""} value="${value}">${label}</option>`).join("")}</select></div>` : type === "number" ? `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" disabled="true" type="number" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>` : type === "text" ? `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" disabled="true" type="text" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>` : ""}</td></tr>`).join("")}</tbody></table>`);
  });

  Object.entries(settings).forEach(([settingKey]) => {
    let key = "GeneralSettings";
    $("body").on("click", `#${key}active${settingKey}`, function () {
      if ($(`#${key}active${settingKey}`)[0].checked) {
        document.getElementById(`${key}${settingKey}`).removeAttribute("disabled");
      } else {
        document.getElementById(`${key}${settingKey}`).setAttribute("disabled", true);
      }
    });
  });

  const ids = Object.keys(t("ids"));
  ids.forEach((key) => {
    const settings = Object.entries(t(`settings.${key}`));
    $("body").on("click", `#veChBtn${key}`, function () {
      $("#veChModalBody").html(`<h4>${t("settingsForAll", { category: t(`tabs.${key}`) })} (${category[key].length.toLocaleString()})</h4>${settings.map(([settingKey, setting]) => {
        if (setting.category === true) {
          return Object.entries(setting).filter(([settingKey]) => settingKey !== "category").map(([settingKey, { title, type, options, dependsOn }]) => {
            if (type === "checkbox") return `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" type="checkbox" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>`;
            if (type === "select") return `<div${dependsOn ? ` class=\"hidden\"` : ""}><label for="${key}${settingKey}">${title}</label><br><select class="custom-select" id="${key}${settingKey}">${options.map(({ label, value }, i) => `<option ${i === 0 ? "selected" : ""} value="${value}">${label}</option>`).join("")}</select></div>`;
          }).join("");
        } else {
          let { title, type, options, dependsOn } = setting;
          if (type === "checkbox") return `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" type="checkbox" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>`;
          if (type === "select") return `<div${dependsOn ? ` class=\"hidden\"` : ""}><label for="${key}${settingKey}">${title}</label><br><select class="custom-select" id="${key}${settingKey}">${options.map(({ label, value }, i) => `<option ${i === 0 ? "selected" : ""} value="${value}">${label}</option>`).join("")}</select></div>`;
          if (type === "number") return `<div class="form-check${dependsOn ? " hidden" : ""}"><input class="form-check-input" type="number" value="" id="${key}${settingKey}"><label class="form-check-label" for="${key}${settingKey}">${title}</label></div>`;
        }
      }).join("")}<br><a class="btn btn-success" id="veChSaveAll" bullet_point="${key}" style="margin-top:2em">${t("setSettings")}</a>`);
    });

    settings.forEach(([settingKey, setting]) => {
      if (setting.category === true) {
        Object.entries(setting).filter(([settingKey]) => settingKey !== "category").forEach(([settingKey, { type, options, dependsOn }]) => {
          if (type === "checkbox") {
            $("body").on("click", `#${key}${dependsOn}`, function () {
              if ($(`#${key}${dependsOn}`)[0].checked) {
                $(`#${key}${settingKey}`).parent().removeClass("hidden");
              } else {
                $(`#${key}${settingKey}`).parent().addClass("hidden");
                $(`#${key}${settingKey}`)[0].checked = false;
              }
            });
          }
          if (type === "select") {
            $("body").on("click", `#${key}${dependsOn}`, function () {
              if ($(`#${key}${dependsOn}`)[0].checked) {
                $(`#${key}${settingKey}`).parent().removeClass("hidden");
              } else {
                $(`#${key}${settingKey}`).parent().addClass("hidden");
                $(`#${key}${settingKey}`).val(options[0]?.value);
              }
            });
          }
        });
      } else {
        let { type, options, dependsOn } = setting;
        if (type === "checkbox") {
          $("body").on("click", `#${key}${dependsOn}`, function () {
            if ($(`#${key}${dependsOn}`)[0].checked) {
              $(`#${key}${settingKey}`).parent().removeClass("hidden");
            } else {
              $(`#${key}${settingKey}`).parent().addClass("hidden");
              $(`#${key}${settingKey}`)[0].checked = false;
            }
          });
        }
        if (type === "select") {
          $("body").on("click", `#${key}${dependsOn}`, function () {
            if ($(`#${key}${dependsOn}`)[0].checked) {
              $(`#${key}${settingKey}`).parent().removeClass("hidden");
            } else {
              $(`#${key}${settingKey}`).parent().addClass("hidden");
              $(`#${key}${settingKey}`).val(options[0]?.value);
            }
          });
        }
        if (type === "number") {
          $("body").on("click", `#${key}${dependsOn}`, function () {
            if ($(`#${key}${dependsOn}`)[0].checked) {
              $(`#${key}${settingKey}`).parent().removeClass("hidden");
            } else {
              $(`#${key}${settingKey}`).parent().addClass("hidden");
              $(`#${key}${settingKey}`).val();
            }
          });
        }
      }
    });
  });

  /* --------------------------------------------------
   *  Lancement de la sauvegarde
   * -------------------------------------------------- */
  $("body").on("click", "#veChSaveAll", function () {
    $(this).attr("disabled", true);
    progress($(this).attr("bullet_point"));
  });
})();
