import { Menu, session, Tray } from "electron";
import { app, BrowserWindow, shell } from "electron/main";
import Store from "electron-store";
import path from "node:path";

let win;
let tray;

const store = new Store();

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
// const host = isDev ? "https://bolls.local" : "https://bolls.life";
const host = "https://bolls.life";
// const host = "https://bolls.local";

function createTray() {
  tray = new Tray("build/tray.png");
  tray.setToolTip("Bolls");

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Bolls",
        click: () => {
          win.show();
        },
      },
      { type: "separator" },
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+shift+N",
        click: createWindow,
      },
      {
        label: "New Private Window",
        accelerator: "CmdOrCtrl+shift+P",
        click: createPrivateWindow,
      },
      { type: "separator" },
      { role: "quit" },
    ])
  );
}

const menu = Menu.buildFromTemplate([
  {
    label: "Bolls",
    submenu: [
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+shift+N",
        click: createWindow,
      },
      {
        label: "New Private Window",
        accelerator: "CmdOrCtrl+shift+P",
        click: createPrivateWindow,
      },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  { role: "editMenu" },
  { role: "viewMenu" },
  { role: "windowMenu" },
]);
Menu.setApplicationMenu(menu);

function windowsCount() {
  return BrowserWindow.getAllWindows().filter((b) => {
    return b.isVisible();
  }).length;
}
/**
 * Returns saved window state
 * sets default values if not saved
 * @returns {Object} mainWindowState
 */
function getMainWindowState() {
  let mainWindowState = store.get();
  if (!mainWindowState) {
    mainWindowState = {};
  }

  if (!store.has("width")) {
    mainWindowState.width = 1280;
  }

  if (!store.has("height")) {
    mainWindowState.height = 800;
  }

  if (!store.has("isFullScreen")) {
    mainWindowState.isFullScreen = false;
  }

  if (!store.has("isMaximized")) {
    mainWindowState.isMaximized = false;
  }

  return mainWindowState;
}

function createPrivateWindow() {
  let private_session = session.fromPartition("private");

  let windows_count = windowsCount();
  const mainWindowState = getMainWindowState();

  // Create the browser window.
  let private_win = new BrowserWindow({
    show: false,
    backgroundColor: "#04060c",
    icon: "build/icon.png",
    webPreferences: {
      sandbox: true,
      defaultFontFamily: "sansSerif",
      session: private_session,
    },
    darkTheme: true,
    x: mainWindowState.x + 64 * (windows_count - 1),
    y: mainWindowState.y + 64 * (windows_count - 1),
    width: mainWindowState.width,
    height: mainWindowState.height,
  });

  private_win.loadURL(host);

  private_win.once("ready-to-show", () => {
    private_win.show();
  });
  private_win.on("enter-full-screen", () => {
    private_win.setAutoHideMenuBar(true);
  });
  private_win.on("leave-full-screen", () => {
    private_win.setAutoHideMenuBar(false);
  });
}

function createWindow() {
  // Used to offset every new window to avoid overlaping with existing windows
  let windows_count = windowsCount();
  const winState = getMainWindowState();

  // Create the browser window.
  win = new BrowserWindow({
    show: false,
    backgroundColor: "#04060c",
    icon: "build/icon.png",
    webPreferences: {
      sandbox: true,
      defaultFontFamily: "sansSerif",
      devTools: !app.isPackaged,
    },
    darkTheme: true,
    x: winState.x + 64 * windows_count,
    y: winState.y + 64 * windows_count,
    width: winState.width,
    height: winState.height,
  });

  // Register listeners on the window to update the state
  // automatically (the listeners will be removed when the window is closed)
  // and restore the maximized or full screen state
  if (windows_count === 0) {
    // Manage only main window
    win.on("maximize", () => {
      store.set("isMaximized", true);
    });
    win.on("unmaximize", () => {
      store.set("isMaximized", false);
    });
    win.on("resize", () => {
      store.set("width", win.getSize()[0]);
      store.set("height", win.getSize()[1]);
    });
    win.on("move", () => {
      store.set("x", win.getPosition()[0]);
      store.set("y", win.getPosition()[1]);
    });

    if (winState.isMaximized) {
      win.maximize();
    }

    if (winState.isFullScreen) {
      win.setFullScreen(true);
    }
  }

  // win.webContents.openDevTools()
  win.loadURL(host);
  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("enter-full-screen", () => {
    win.setAutoHideMenuBar(true);
    if (windows_count === 0) store.set("isFullScreen", true);
  });
  win.on("leave-full-screen", () => {
    win.setAutoHideMenuBar(false);
    if (windows_count === 0) store.set("isFullScreen", false);
  });
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("bolls", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("bolls");
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit(); // or maybe ignore
} else {
  app.on("second-instance", async (event, commandLine, workingDirectory) => {
    consoe.log("second-instance", event, commandLine, workingDirectory);
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const mainSession = win.webContents.session
      ? win.webContents.session
      : session.defaultSession;
    // the commandLine is array of strings in which last element is deep link url
    const lastCommand = commandLine.pop();
    try {
      // if the last element is not a url -- then it's not a deep link
      new URL(lastCommand);
    } catch (e) {
      // if the last element is not a url -- then it's not a deep link
      console.log("Not a deep link", e);
      return;
    }
    const url = new URL(commandLine.pop());
    if (url.protocol !== "bolls:" || !url.searchParams.get("sessionid")) return;
    // if the we already have the cookie set -- we don't need to set it again
    const mySessionidCookies = await mainSession.cookies.get({
      name: "sessionid",
    });
    const mySessionid = mySessionidCookies[0]?.value;

    if (mySessionid === atob(url.searchParams.get("sessionid"))) return;

    mainSession.cookies.set({
      url: host,
      name: "sessionid",
      value: atob(url.searchParams.get("sessionid")),
      expirationDate: Math.floor(Date.now() / 1000) + 31536000, // Expires in 1 year
    });
    // then reload the main window
    win.loadURL(host);
  });

  // Create win, load the rest of the app, etc...
  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler((details) => {
    if (details.disposition === "foreground-tab") {
      shell.openExternal(details.url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
});

// Make OSX work same as all other systems
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
