function escapeForTemplate(value) {
  return JSON.stringify(String(value || ""));
}

export function buildFcmSyncScript({ apiBaseUrl, fcmToken }) {
  const safeApiBaseUrl = escapeForTemplate(apiBaseUrl);
  const safeFcmToken = escapeForTemplate(fcmToken);

  return `
    (function () {
      try {
        var config = window.__servicePortalFcmConfig || {};
        config.apiBaseUrl = ${safeApiBaseUrl};
        config.fcmToken = ${safeFcmToken};
        window.__servicePortalFcmConfig = config;

        if (!window.__servicePortalFcmRegister) {
          window.__servicePortalFcmRegister = async function () {
            try {
              var currentConfig = window.__servicePortalFcmConfig || {};
              var apiBaseUrl = currentConfig.apiBaseUrl || "";
              var fcmToken = currentConfig.fcmToken || "";
              if (!apiBaseUrl || !fcmToken) {
                return;
              }

              var authToken = window.localStorage ? (window.localStorage.getItem("rto_customer_token") || "") : "";
              if (!authToken) {
                return;
              }

              if (window.__servicePortalFcmLastSynced === fcmToken) {
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

              window.__servicePortalFcmLastSynced = fcmToken;
            } catch (error) {
              console.warn("FCM token sync failed", error);
            }
          };
        }

        if (!window.__servicePortalFcmListenerInstalled) {
          window.__servicePortalFcmListenerInstalled = true;
          window.addEventListener("serviceportal-auth-change", function () {
            window.__servicePortalFcmRegister();
          });
        }

        window.__servicePortalFcmRegister();
      } catch (error) {
        console.warn("FCM bridge injection failed", error);
      }
    })();
    true;
  `;
}
