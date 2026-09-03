function escapeForTemplate(value) {
  return JSON.stringify(String(value || ""));
}

export function buildFcmSyncScript({ apiBaseUrl, fcmToken }) {
  const safeApiBaseUrl = escapeForTemplate(apiBaseUrl);
  const safeFcmToken = escapeForTemplate(fcmToken);

  return `
    (function () {
      try {
        var config = window.__jcbExchangeFcmConfig || {};
        config.apiBaseUrl = ${safeApiBaseUrl};
        config.fcmToken = ${safeFcmToken};
        window.__jcbExchangeFcmConfig = config;

        if (!window.__jcbExchangeFcmRegister) {
          window.__jcbExchangeFcmRegister = async function () {
            try {
              var currentConfig = window.__jcbExchangeFcmConfig || {};
              var apiBaseUrl = currentConfig.apiBaseUrl || "";
              var fcmToken = currentConfig.fcmToken || "";
              if (!apiBaseUrl || !fcmToken) {
                return;
              }

              var authToken = window.localStorage ? (window.localStorage.getItem("frontend_portal_token") || "") : "";
              if (!authToken) {
                return;
              }

              if (window.__jcbExchangeFcmLastSynced === fcmToken) {
                return;
              }

              await fetch(apiBaseUrl.replace(/\\/$/, "") + "/api/users/fcm-token", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + authToken
                },
                body: JSON.stringify({ token: fcmToken })
              });

              window.__jcbExchangeFcmLastSynced = fcmToken;
            } catch (error) {
              console.warn("FCM token sync failed", error);
            }
          };
        }

        if (!window.__jcbExchangeFcmListenerInstalled) {
          window.__jcbExchangeFcmListenerInstalled = true;
          window.addEventListener("jcbexchange-auth-change", function () {
            window.__jcbExchangeFcmRegister();
          });
          window.addEventListener("serviceportal-auth-change", function () {
            window.__jcbExchangeFcmRegister();
          });
        }

        window.__jcbExchangeFcmRegister();
      } catch (error) {
        console.warn("FCM bridge injection failed", error);
      }
    })();
    true;
  `;
}
