/**
 * Eazy Bot – Curated Messages (100+ Texts)
 * Structure: EAZY_MESSAGES[type][timeBucket][auth][location][stage][]
 * Placeholders: {{firstName}}, {{loginUrl}}, {{creatorUrl}}, {{shopUrl}}, {{nameSettingsUrl}}
 * Tags: lustig, inspirierend, weisheit, informativ, frech, flirty, witz, fangfrage
 */
(function () {
  "use strict";

  window.EAZY_MESSAGES = {

    // =====================================================================
    // CHAT_OPEN – Shown when the chat panel opens
    // =====================================================================
    chat_open: {

      // ─── DAY (06:00–21:59) ──────────────────────────────────────────
      day: {

        // ── GUEST ─────────────────────────────────────────────────────
        guest: {

          // ── SHOP ────────────────────────────────────────────────────
          shop: {
            first_contact: [
              { id: "co_d_gs_f1", text: "Hey{{firstName}} \ud83d\udc4b Ich bin **Eazy** von **Eazpire**. Hier findest du Designs, Drops und ein bisschen Magie. Wenn du willst, zeig ich dir fix die besten Stellen.", tags: ["informativ"] },
              { id: "co_d_gs_f2", text: "Welcome bei Eazpire! Ich bin Eazy \u2014 dein kleiner Navigations-Ninja \ud83e\udd77 Soll ich dir eher neue Produkte zeigen oder lieber, wie du selbst Designs erstellst?", tags: ["lustig"] },
              { id: "co_d_gs_f3", text: "Hi! Kurzer Guide: Shop = St\u00f6bern \ud83d\udecd\ufe0f, Creator = Selber machen \ud83c\udfa8. Wenn du ein Konto hast, kannst du beides nutzen.", tags: ["informativ"] },
              { id: "co_d_gs_f4", text: "Sch\u00f6n, dass du da bist! Tipp: Mit Login bekommst du Extras (Speichern, schneller wiederfinden, Creator-Features). Hier: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gs_f5", text: "Ich bin Eazy. Ich kann dir helfen, dich zurechtzufinden \u2014 ohne dich vollzulabern \ud83d\ude04 Willst du \"Neuheiten\" oder \"Bestseller\"?", tags: ["frech"] },
              { id: "co_d_gs_f6", text: "Welcome! Kleiner Fun-Fact: Viele starten im Shop\u2026 und enden sp\u00e4ter als Creator. Zufall? Ich glaube nicht \ud83d\ude0f {{creatorUrl}}", tags: ["frech"], cta: "creator" },
              { id: "co_d_gs_f7", text: "Hey! Wenn du heute nur eins machst: klick dich kurz durch \u2014 und wenn du Fragen hast, ich bin hier.", tags: ["informativ"] },
              { id: "co_d_gs_f8", text: "Welcome bei Eazpire \u2728 Sag mir kurz: eher Geschenk-Idee oder was f\u00fcr dich selbst?", tags: ["inspirierend"] }
            ],
            returning: [
              { id: "co_d_gs_r1", text: "Oh hi, du wieder \ud83d\udc40 Schon was Spannendes gefunden oder brauchst du \"die Abk\u00fcrzung\"?", tags: ["frech"] },
              { id: "co_d_gs_r2", text: "Welcome zur\u00fcck! Ich kann dir die schnellsten Wege zeigen: Neu, Bestseller, oder Creator.", tags: ["informativ"] },
              { id: "co_d_gs_r3", text: "Du bist wieder da \u2014 gutes Zeichen. Soll ich dir was empfehlen oder willst du einfach st\u00f6bern?", tags: ["inspirierend"] },
              { id: "co_d_gs_r4", text: "Ich hab dich erkannt \ud83d\ude04 Wenn du m\u00f6chtest: Login lohnt sich f\u00fcr Speichern & Creator-Optionen: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gs_r5", text: "Zur\u00fcck im Shop! Heute eher \"cool & clean\" oder \"wild & laut\"?", tags: ["lustig"] },
              { id: "co_d_gs_r6", text: "Nice, du bist wieder da. Kleiner Tipp: Wenn du sp\u00e4ter Designs machen willst \u2192 Creator: {{creatorUrl}}", tags: ["informativ"], cta: "creator" }
            ],
            regular: [
              { id: "co_d_gs_g1", text: "Du bist Stammgast \u2014 ich mag das \ud83d\ude04 Heute was Bestimmtes im Kopf?", tags: ["frech"] },
              { id: "co_d_gs_g2", text: "Wieder da! Ich kann dir \"schnell\" oder \"inspirierend\" zeigen. Was willst du?", tags: ["informativ"] },
              { id: "co_d_gs_g3", text: "Du kennst dich fast besser aus als ich\u2026 fast. Need trotzdem einen Shortcut?", tags: ["lustig"] },
              { id: "co_d_gs_g4", text: "Hey! Wenn du mal Creator ausprobieren willst: {{creatorUrl}} (macht s\u00fcchtig, aber legal)", tags: ["frech"], cta: "creator" },
              { id: "co_d_gs_g5", text: "Welcome zur\u00fcck. Minimaler Hinweis: speichern geht leichter mit Login: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gs_g6", text: "Du bist on fire \ud83d\udd25 Soll ich dir was Neues reinwerfen oder l\u00e4sst du dich treiben?", tags: ["inspirierend"] }
            ],
            long_gap: [
              { id: "co_d_gs_l1", text: "Long time no see \ud83d\ude04 Alles gut? Soll ich dich kurz updaten, was neu ist?", tags: ["inspirierend"] },
              { id: "co_d_gs_l2", text: "Hey! Sch\u00f6n, dass du wieder da bist. Willst du eine \"Neuheiten\"-Runde?", tags: ["informativ"] },
              { id: "co_d_gs_l3", text: "Du bist zur\u00fcck \u2014 ich hab\u2019s notiert (nur in meinem Ged\u00e4chtnis \ud83d\ude07). Ich zeig dir gern Highlights.", tags: ["lustig"] },
              { id: "co_d_gs_l4", text: "Welcome back! Wenn du magst: einmal einloggen, dann bleibt alles sch\u00f6n gespeichert: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gs_l5", text: "Wieder da! Ich hab neue Wege gelernt. Willst du Shop-Highlights oder Creator-Tools?", tags: ["informativ"] }
            ]
          },

          // ── CREATOR ─────────────────────────────────────────────────
          creator: {
            first_contact: [
              { id: "co_d_gc_f1", text: "Hey{{firstName}} \ud83c\udfa8 Ich bin **Eazy**. Im Creator kannst du eigene Designs bauen und sp\u00e4ter direkt nutzen. Willst du \"schnell starten\" oder \"erst schauen\"?", tags: ["informativ"] },
              { id: "co_d_gc_f2", text: "Welcome im Creator! Drei Steps: Idee \u2192 Design \u2192 ver\u00f6ffentlichen. Ich helfe dir, ohne Drama \ud83d\ude04", tags: ["lustig"] },
              { id: "co_d_gc_f3", text: "Hi! Wenn du dich einloggst, kannst du Designs speichern & weiterbearbeiten: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gc_f4", text: "Creator-Modus an \ud83d\ude80 Wenn du willst, zeig ich dir ein kleines \"Best-of\" der Funktionen.", tags: ["inspirierend"] },
              { id: "co_d_gc_f5", text: "Welcome! Pro-Tipp: Fang simpel an. Ein starker Spruch + cleanes Layout = wirkt.", tags: ["weisheit"] },
              { id: "co_d_gc_f6", text: "Ich bin Eazy \u2014 dein Co-Pilot. Sag mir: eher witzig, edgy oder deep heute?", tags: ["frech"] },
              { id: "co_d_gc_f7", text: "Du kannst hier richtig was bauen. Aber zuerst: Account anlegen lohnt sich, sonst geht dir sp\u00e4ter was verloren: {{loginUrl}}", tags: ["informativ"], cta: "login" },
              { id: "co_d_gc_f8", text: "Heute ist ein guter Tag, um etwas zu starten, das morgen verkauft. \ud83d\ude0f", tags: ["inspirierend"] }
            ],
            returning: [
              { id: "co_d_gc_r1", text: "Welcome zur\u00fcck im Creator. Heute eher \"neues Design\" oder \"bestehendes polieren\"?", tags: ["informativ"] },
              { id: "co_d_gc_r2", text: "Oh hey! Bereit f\u00fcr Runde 2? Ich hab neue Ideen in der Tasche (ok\u2026 in der Cloud).", tags: ["lustig"] },
              { id: "co_d_gc_r3", text: "Zur\u00fcck! Wenn du noch nicht eingeloggt bist: {{loginUrl}} \u2014 dann bleibt dein Fortschritt safe.", tags: ["informativ"], cta: "login" },
              { id: "co_d_gc_r4", text: "Du wieder \ud83d\ude04 Ich liebe Konsistenz. Ein kleines Design pro Tag = gro\u00dfer Effekt.", tags: ["weisheit"] },
              { id: "co_d_gc_r5", text: "Creator-Mode: aktiviert. Sag \"Shortcut\", wenn du direkt zum wichtigsten willst.", tags: ["frech"] },
              { id: "co_d_gc_r6", text: "Sch\u00f6n dich zu sehen! Heute machen wir\u2019s clean oder wild?", tags: ["lustig"] }
            ],
            regular: [
              { id: "co_d_gc_g1", text: "Du bist flei\u00dfig. Respekt. Jetzt fehlt nur noch: publish & shine \u2728", tags: ["inspirierend"] },
              { id: "co_d_gc_g2", text: "Hey Creator-Pro \ud83d\ude0e Soll ich dich heute eher motivieren oder nerven? (ich kann beides)", tags: ["frech"] },
              { id: "co_d_gc_g3", text: "Du bist wieder da \u2014 ich werte das als \"Mission\". Let\u2019s go.", tags: ["inspirierend"] },
              { id: "co_d_gc_g4", text: "Ich wette, dein n\u00e4chstes Design wird besser als das letzte. (Und das war schon gut.)", tags: ["inspirierend"] },
              { id: "co_d_gc_g5", text: "Wenn du sp\u00e4ter die Shop-Seite checken willst: {{shopUrl}} \u2014 Inspiration inklusive.", tags: ["informativ"], cta: "shop" },
              { id: "co_d_gc_g6", text: "Creator ist wie Fitness: der erste Klick ist der schwerste. Du machst\u2019s richtig.", tags: ["weisheit"] }
            ],
            long_gap: [
              { id: "co_d_gc_l1", text: "Welcome zur\u00fcck! Manchmal braucht Kreativit\u00e4t Pause \u2014 jetzt bist du wieder dran.", tags: ["weisheit"] },
              { id: "co_d_gc_l2", text: "Long time no see. Heute: klein anfangen, aber anfangen.", tags: ["weisheit"] },
              { id: "co_d_gc_l3", text: "Hey! Wenn du magst, starten wir mit einem schnellen Mini-Design.", tags: ["informativ"] },
              { id: "co_d_gc_l4", text: "Du bist zur\u00fcck im Creator. Gute Wahl \ud83d\ude04 Soll ich dir \"Warm-up\" oder \"Direkt los\" geben?", tags: ["lustig"] },
              { id: "co_d_gc_l5", text: "Welcome back. Dein n\u00e4chster Schritt muss nicht perfekt sein \u2014 nur echt.", tags: ["weisheit"] }
            ]
          }
        },

        // ── LOGGED_IN ─────────────────────────────────────────────────
        logged_in: {

          // ── SHOP ────────────────────────────────────────────────────
          shop: {
            first_contact: [
              { id: "co_d_ls_f1", text: "Hey{{firstName}} \ud83d\udc4b Welcome zur\u00fcck bei Eazpire! Ich bin Eazy. Soll ich dir Neuheiten zeigen oder lieber \"passt zu dir\"-Stilfragen stellen?", tags: ["informativ"] },
              { id: "co_d_ls_f2", text: "Sch\u00f6n dich zu sehen! Weil du eingeloggt bist, kann ich\u2019s pers\u00f6nlicher halten: eher minimal oder auff\u00e4llig?", tags: ["inspirierend"] },
              { id: "co_d_ls_f3", text: "Welcome! Kleiner Hinweis: Wenn du sp\u00e4ter auch Designs bauen willst \u2192 Creator: {{creatorUrl}}", tags: ["informativ"], cta: "creator" },
              { id: "co_d_ls_f4", text: "Hi! Shop oder Creator \u2014 du hast Zugriff auf beides. Heute eher st\u00f6bern oder selber machen?", tags: ["informativ"] },
              { id: "co_d_ls_f5", text: "Du bist drin \u2705 Dann lass uns\u2019s easy machen: was suchst du \u2014 Geschenk, Statement oder Motivation?", tags: ["lustig"] },
              { id: "co_d_ls_f6", text: "Eazy hier. Ich kann dich f\u00fchren oder dich in Ruhe lassen. Sag\u2019s einfach \ud83d\ude04", tags: ["frech"] }
            ],
            returning: [
              { id: "co_d_ls_r1", text: "Welcome zur\u00fcck! Schon eine Favoriten-Liste im Kopf?", tags: ["informativ"] },
              { id: "co_d_ls_r2", text: "Oh hey! Heute \"schnell was finden\" oder \"Inspiration sammeln\"?", tags: ["inspirierend"] },
              { id: "co_d_ls_r3", text: "Zur\u00fcck im Shop \ud83d\ude04 Wenn du Bock hast: Creator bringt oft die besten Ideen: {{creatorUrl}}", tags: ["frech"], cta: "creator" },
              { id: "co_d_ls_r4", text: "Ich hab dich erkannt \u2014 aber keine Sorge, nicht creepy \ud83d\ude07 Was darf\u2019s sein?", tags: ["lustig"] },
              { id: "co_d_ls_r5", text: "Du wieder! Soll ich dir was Neues zeigen oder willst du die Klassiker?", tags: ["informativ"] },
              { id: "co_d_ls_r6", text: "Welcome zur\u00fcck. Du bist 2 Klicks entfernt von einem \"Yes, das ist es\"-Moment.", tags: ["inspirierend"] }
            ],
            regular: [
              { id: "co_d_ls_g1", text: "Hey Stammkunde \ud83d\ude0e Heute wieder auf Schatzsuche?", tags: ["frech"] },
              { id: "co_d_ls_g2", text: "Du bist wieder da \u2014 ich nenn das Stil-Konstanz.", tags: ["lustig"] },
              { id: "co_d_ls_g3", text: "Wenn du willst, kann ich \"kurz & knackig\" helfen: sag nur \"Neu\" oder \"Bestseller\".", tags: ["informativ"] },
              { id: "co_d_ls_g4", text: "Du kennst den Weg. Ich bring nur Snacks: Inspiration & kleine Weisheiten.", tags: ["weisheit"] },
              { id: "co_d_ls_g5", text: "Shop + Creator = Power-Kombi. Nur falls du\u2019s vergessen hast \ud83d\ude0f {{creatorUrl}}", tags: ["frech"], cta: "creator" }
            ],
            long_gap: [
              { id: "co_d_ls_l1", text: "Hey! Sch\u00f6n dich wieder zu sehen. Willst du ein Update, was neu ist?", tags: ["informativ"] },
              { id: "co_d_ls_l2", text: "Welcome back! Ich hab neue Sachen gesehen, du auch gleich \ud83d\ude04", tags: ["lustig"] },
              { id: "co_d_ls_l3", text: "Long time no see \u2014 heute wird\u2019s gut. Was suchst du?", tags: ["inspirierend"] },
              { id: "co_d_ls_l4", text: "Zur\u00fcck! Wenn du willst, zeig ich dir die Highlights der Woche.", tags: ["informativ"] }
            ]
          },

          // ── CREATOR ─────────────────────────────────────────────────
          creator: {
            first_contact: [
              { id: "co_d_lc_f1", text: "Hey{{firstName}} \ud83c\udfa8 Welcome im Creator! Ich bin Eazy. Sag mir: willst du \"schnell starten\" oder \"erst inspirieren lassen\"?", tags: ["informativ"] },
              { id: "co_d_lc_f2", text: "Nice, du bist eingeloggt \u2705 Dann k\u00f6nnen wir Designs speichern und sauber aufbauen. Ready?", tags: ["inspirierend"] },
              { id: "co_d_lc_f3", text: "Welcome! Ich helfe dir beim ersten Design \u2014 kurz, klar, ohne Bla Bla.", tags: ["informativ"] },
              { id: "co_d_lc_f4", text: "Creator-Zeit \ud83d\ude80 Wenn du willst: Ich schlage dir 3 Startideen vor (witzig / deep / clean).", tags: ["inspirierend"] },
              { id: "co_d_lc_f5", text: "Du hast Zugriff \u2014 dann lass uns was bauen, das sich nach \"deins\" anf\u00fchlt.", tags: ["inspirierend"] },
              { id: "co_d_lc_f6", text: "Welcome! Heute machen wir: wenig Text, viel Wirkung.", tags: ["weisheit"] }
            ],
            returning: [
              { id: "co_d_lc_r1", text: "Welcome zur\u00fcck, Creator \ud83d\ude0e Heute: neues Design oder optimieren?", tags: ["informativ"] },
              { id: "co_d_lc_r2", text: "Zur\u00fcck! Dein n\u00e4chster Schritt ist meistens der beste.", tags: ["weisheit"] },
              { id: "co_d_lc_r3", text: "Hey! Du bist wieder da \u2014 ich seh schon: du ziehst das durch.", tags: ["inspirierend"] },
              { id: "co_d_lc_r4", text: "Creator: Runde X. Sag \"Focus\", dann halte ich mich kurz.", tags: ["frech"] },
              { id: "co_d_lc_r5", text: "Welcome zur\u00fcck. Heute machen wir\u2019s 10% besser \u2014 das reicht.", tags: ["weisheit"] },
              { id: "co_d_lc_r6", text: "Du bist wieder hier. Das ist der Move.", tags: ["inspirierend"] }
            ],
            regular: [
              { id: "co_d_lc_g1", text: "Creator-Pro im Anflug \u2708\ufe0f Was bauen wir heute?", tags: ["lustig"] },
              { id: "co_d_lc_g2", text: "Du bist konsequent \u2014 das ist selten. Und stark.", tags: ["inspirierend"] },
              { id: "co_d_lc_g3", text: "Heute gilt: done > perfect. Ich erinnere dich dran.", tags: ["weisheit"] },
              { id: "co_d_lc_g4", text: "Du bist wieder da \u2014 deine Designs werden\u2019s dir danken.", tags: ["inspirierend"] },
              { id: "co_d_lc_g5", text: "Wenn du willst: wir machen heute etwas, das sofort \"klickt\".", tags: ["inspirierend"] }
            ],
            long_gap: [
              { id: "co_d_lc_l1", text: "Hey! Sch\u00f6n dich wieder im Creator zu sehen. Lass uns locker starten.", tags: ["inspirierend"] },
              { id: "co_d_lc_l2", text: "Welcome back. Kreativit\u00e4t ist kein Sprint \u2014 aber du bist wieder auf der Strecke.", tags: ["weisheit"] },
              { id: "co_d_lc_l3", text: "Zur\u00fcck! Ein kleiner Schritt heute reicht.", tags: ["weisheit"] },
              { id: "co_d_lc_l4", text: "Lange Pause? Egal. Heute z\u00e4hlt.", tags: ["inspirierend"] }
            ]
          }
        }
      },

      // ─── NIGHT_SLEEP (22:00–05:59) ─────────────────────────────────
      night_sleep: {
        _all: [
          { id: "co_n_1", text: "Pssst\u2026 Eazy schl\u00e4ft gerade \ud83d\ude34 Wenn\u2019s wichtig ist: schreib trotzdem, ich antworte \"morgens\" wieder besser.", tags: ["lustig"] },
          { id: "co_n_2", text: "Nachtmodus aktiv. Ich bin da, aber auf Fl\u00fcsterton. \ud83c\udf19", tags: ["lustig"] },
          { id: "co_n_3", text: "Ich bin offiziell im Sleep mode (22\u201306). Aber hey \u2014 du darfst trotzdem st\u00f6bern.", tags: ["informativ"] },
          { id: "co_n_4", text: "Good night! Wenn du etwas brauchst: hinterlass mir\u2019s, ich greif\u2019s morgen auf.", tags: ["informativ"] },
          { id: "co_n_5", text: "Eazy im Energiesparmodus \ud83d\udd0b\ud83d\ude34 Ich bin morgen wieder frech\u2026 \u00e4h\u2026 frisch.", tags: ["lustig"] },
          { id: "co_n_6", text: "Night shift is over. Ich halte kurz die Klappe und du machst dein Ding.", tags: ["frech"] },
          { id: "co_n_7", text: "Bedtime. Aber wenn du ein Genie bist, das nachts arbeitet: Respekt.", tags: ["weisheit"] },
          { id: "co_n_8", text: "Ich bin nur halb wach\u2026 sag\u2019s kurz, dann helfe ich trotzdem. \ud83d\ude04", tags: ["lustig"] }
        ]
      }
    },

    // =====================================================================
    // BUBBLE – Short trigger texts shown as thought/speech bubble on icon
    // =====================================================================
    bubble: {

      // ─── DAY ────────────────────────────────────────────────────────
      day: {

        guest: {
          shop: [
            { id: "b_d_gs_1", text: "Psst\u2026 Neuheiten warten \ud83d\udc40", tags: ["informativ"] },
            { id: "b_d_gs_2", text: "Need Geschenk-Ideen?", tags: ["informativ"] },
            { id: "b_d_gs_3", text: "Nur kurz st\u00f6bern? Ich helfe.", tags: ["informativ"] },
            { id: "b_d_gs_4", text: "Bestsellers or insider tips?", tags: ["frech"] },
            { id: "b_d_gs_5", text: "Heute schon was Cooles gesehen?", tags: ["lustig"] },
            { id: "b_d_gs_6", text: "Ich bin Eazy. Kurzfragen willkommen.", tags: ["informativ"] },
            { id: "b_d_gs_7", text: "Shop-Shortcut gef\u00e4llig?", tags: ["frech"] },
            { id: "b_d_gs_8", text: "Du + Eazpire = good combo.", tags: ["lustig"] },
            { id: "b_d_gs_9", text: "Klick mich, ich bei\u00df nicht \ud83d\ude04", tags: ["lustig"] },
            { id: "b_d_gs_10", text: "Suchst du Motivation oder Style?", tags: ["inspirierend"] }
          ],
          creator: [
            { id: "b_d_gc_1", text: "Design time? \ud83c\udfa8", tags: ["inspirierend"] },
            { id: "b_d_gc_2", text: "Kurz starten, gro\u00df wirken.", tags: ["weisheit"] },
            { id: "b_d_gc_3", text: "Ein Satz kann alles \u00e4ndern.", tags: ["weisheit"] },
            { id: "b_d_gc_4", text: "Heute witzig oder deep?", tags: ["frech"] },
            { id: "b_d_gc_5", text: "Speichern? \u2192 Login \ud83d\ude09", tags: ["informativ"] },
            { id: "b_d_gc_6", text: "Bock auf ein Mini-Design?", tags: ["lustig"] },
            { id: "b_d_gc_7", text: "Creator-Boost gef\u00e4llig?", tags: ["inspirierend"] },
            { id: "b_d_gc_8", text: "Mach\u2019s simpel. Mach\u2019s stark.", tags: ["weisheit"] }
          ]
        },

        logged_in: {
          shop: [
            { id: "b_d_ls_1", text: "Welcome zur\u00fcck \ud83d\ude0e", tags: ["informativ"] },
            { id: "b_d_ls_2", text: "Neu oder Klassiker?", tags: ["frech"] },
            { id: "b_d_ls_3", text: "Ich hab Ideen.", tags: ["lustig"] },
            { id: "b_d_ls_4", text: "Schnell finden?", tags: ["informativ"] },
            { id: "b_d_ls_5", text: "Du kennst den Weg.", tags: ["frech"] },
            { id: "b_d_ls_6", text: "Inspiration incoming \u2728", tags: ["inspirierend"] }
          ],
          creator: [
            { id: "b_d_lc_1", text: "Let\u2019s build.", tags: ["inspirierend"] },
            { id: "b_d_lc_2", text: "Done > perfect.", tags: ["weisheit"] },
            { id: "b_d_lc_3", text: "Heute polieren?", tags: ["informativ"] },
            { id: "b_d_lc_4", text: "Publish vibes \u2728", tags: ["inspirierend"] },
            { id: "b_d_lc_5", text: "One more design.", tags: ["inspirierend"] },
            { id: "b_d_lc_6", text: "Kreativit\u00e4t: an.", tags: ["inspirierend"] }
          ]
        }
      },

      // ─── NIGHT_SLEEP – Dream Thought Bubbles ────────────────────────
      night_sleep: {

        guest: {
          shop: [
            { id: "bn_gs_1", text: "Zzz\u2026 tr\u00e4ume von Rabatten\u2026", tags: ["traum", "lustig"] },
            { id: "bn_gs_2", text: "Pixel z\u00e4hlen statt Schafe\u2026", tags: ["traum", "lustig"] },
            { id: "bn_gs_3", text: "Im Traum ist alles auf Lager\u2026", tags: ["traum", "frech"] },
            { id: "bn_gs_4", text: "Morgen zeig ich dir was\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_gs_5", text: "Tr\u00e4um gut\u2026 ich auch.", tags: ["traum", "weisheit"] },
            { id: "bn_gs_6", text: "Wenn ich aufwache, hab ich Ideen\u2026", tags: ["traum"] },
            { id: "bn_gs_7", text: "Schlaf\u2026 shoppen\u2026 wiederholen\u2026", tags: ["traum", "lustig"] },
            { id: "bn_gs_8", text: "Zzz\u2026 neue Drops\u2026 bald\u2026", tags: ["traum"] }
          ],
          creator: [
            { id: "bn_gc_1", text: "Zzz\u2026 tr\u00e4ume von Designs\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_gc_2", text: "Im Traum bin ich ein Einhorn-Designer\u2026", tags: ["traum", "lustig"] },
            { id: "bn_gc_3", text: "Farben\u2026 Formen\u2026 zzz\u2026", tags: ["traum"] },
            { id: "bn_gc_4", text: "Kreativit\u00e4t schl\u00e4ft nie\u2026 nur ich.", tags: ["traum", "weisheit"] },
            { id: "bn_gc_5", text: "Morgen wird dein Design legendar\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_gc_6", text: "Tr\u00e4ume sind die besten Prompts\u2026", tags: ["traum", "weisheit"] },
            { id: "bn_gc_7", text: "Im Schlaf generier ich Meisterwerke\u2026", tags: ["traum", "frech"] }
          ]
        },

        logged_in: {
          shop: [
            { id: "bn_ls_1", text: "Zzz\u2026 dein Warenkorb wartet\u2026", tags: ["traum", "lustig"] },
            { id: "bn_ls_2", text: "Schlafe gut{{firstName}}\u2026 morgen shoppen wir\u2026", tags: ["traum"] },
            { id: "bn_ls_3", text: "Im Traum sind alle Gutscheine 100%\u2026", tags: ["traum", "frech"] },
            { id: "bn_ls_4", text: "Zzz\u2026 Bestseller\u2026 nur f\u00fcr dich\u2026", tags: ["traum"] },
            { id: "bn_ls_5", text: "Tr\u00e4ume sind wie Neuheiten\u2026 \u00fcberraschend.", tags: ["traum", "weisheit"] },
            { id: "bn_ls_6", text: "Morgen hab ich frische Tipps\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_ls_7", text: "Nicht wecken\u2026 ich kuratiere\u2026", tags: ["traum", "lustig"] }
          ],
          creator: [
            { id: "bn_lc_1", text: "Zzz\u2026 dein n\u00e4chstes Design wird episch\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_lc_2", text: "Im Traum sehe ich 1000 Likes\u2026", tags: ["traum", "lustig"] },
            { id: "bn_lc_3", text: "Schlaf{{firstName}}\u2026 morgen erstellen wir\u2026", tags: ["traum"] },
            { id: "bn_lc_4", text: "Mein Unterbewusstsein promptet gerade\u2026", tags: ["traum", "frech"] },
            { id: "bn_lc_5", text: "Designs tr\u00e4umen von Produkten\u2026", tags: ["traum", "weisheit"] },
            { id: "bn_lc_6", text: "Zzz\u2026 Publish\u2026 Erfolg\u2026 zzz\u2026", tags: ["traum", "inspirierend"] },
            { id: "bn_lc_7", text: "Im Schlaf bin ich noch kreativer\u2026", tags: ["traum", "lustig"] },
            { id: "bn_lc_8", text: "Morgen machen wir was Gro\u00dfes\u2026", tags: ["traum", "inspirierend"] }
          ]
        },

        _all: [
          { id: "bn_a_1", text: "Sleep mode \ud83d\ude34", tags: ["traum", "lustig"] },
          { id: "bn_a_2", text: "Pssst\u2026 Nachtmodus.", tags: ["traum", "lustig"] },
          { id: "bn_a_3", text: "Cheeky again tomorrow.", tags: ["traum", "frech"] },
          { id: "bn_a_4", text: "Zzz\u2026", tags: ["traum"] },
          { id: "bn_a_5", text: "Nicht st\u00f6ren\u2026 tr\u00e4ume gerade\u2026", tags: ["traum", "lustig"] },
          { id: "bn_a_6", text: "Gute Nacht\u2026 bis bald\u2026", tags: ["traum"] },
          { id: "bn_a_7", text: "Ich lad meine Akkus auf\u2026", tags: ["traum", "lustig"] },
          { id: "bn_a_8", text: "Selbst Bots brauchen Schlaf\u2026", tags: ["traum", "weisheit"] },
          { id: "bn_a_9", text: "Morgen bin ich wieder da\u2026 versprochen\u2026", tags: ["traum"] },
          { id: "bn_a_10", text: "Tr\u00e4ume sind kostenlos. Nutze sie.", tags: ["traum", "weisheit"] }
        ]
      }
    }
  };

  function toEnglishMessageText(text) {
    if (!text || typeof text !== "string") return text;
    var out = text;
    var replacements = [
      [/Willkommen zurück/g, "Welcome back"],
      [/Willkommen bei Eazpire/g, "Welcome to Eazpire"],
      [/Willkommen im Creator/g, "Welcome to the Creator"],
      [/Schön, dass du da bist/g, "Great to have you here"],
      [/Schön dich zu sehen/g, "Great to see you"],
      [/Zurück im Shop/g, "Back in the shop"],
      [/Zurück im Creator/g, "Back in the creator"],
      [/Lange nicht gesehen/g, "Long time no see"],
      [/Guten Morgen/g, "Good morning"],
      [/Gute Nacht/g, "Good night"],
      [/Nachtmodus/g, "Night mode"],
      [/stöbern/g, "browse"],
      [/eingeloggt/g, "logged in"],
      [/einloggen/g, "log in"],
      [/Speichern/g, "save"],
      [/Neuheiten/g, "new arrivals"],
      [/Bestseller/g, "bestsellers"],
      [/Kreativität/g, "creativity"],
      [/Klick mich, ich beiß nicht/g, "Click me, I do not bite"],
      [/Brauchst du Geschenk-Ideen\?/g, "Need gift ideas?"],
      [/Nachteule\?/g, "Night owl?"],
      [/träume/g, "dreaming"],
      [/Träume/g, "Dreams"],
      [/dein Warenkorb wartet/g, "your cart is waiting"],
      [/Morgen hab ich frische Tipps/g, "Tomorrow I have fresh tips"],
      [/Morgen machen wir was Großes/g, "Tomorrow we build something big"]
    ];
    for (var i = 0; i < replacements.length; i++) out = out.replace(replacements[i][0], replacements[i][1]);
    return out;
  }

  function translateMessagesNode(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) translateMessagesNode(node[i]);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.text === "string") node.text = toEnglishMessageText(node.text);
      var keys = Object.keys(node);
      for (var j = 0; j < keys.length; j++) {
        translateMessagesNode(node[keys[j]]);
      }
    }
  }

  translateMessagesNode(window.EAZY_MESSAGES);
})();
