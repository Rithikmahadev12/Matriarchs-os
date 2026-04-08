import { Xen } from "./Xen";
import { XenTransport } from "./core/Transport";
import { update } from "./core/update";
import { bootSplash } from "./ui/bootSplash";
import { initSw } from "./sw/register-sw";

let DEBUG: boolean = false;

async function parseArgs() {
    const args = new URLSearchParams(window.location.search);

    if (args.get('debug') === 'true') DEBUG = true;

    if (localStorage.getItem('checked') === 'true') return;

    if (args.get('bootstrap-fs') === 'false') {
        try {
            const req = indexedDB.open('xen-shared', 1);

            req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains("opts")) {
                    db.createObjectStore("opts", { keyPath: "key" });
                }
            };

            req.onsuccess = (e: Event) => {
                const db = (e.target as IDBOpenDBRequest).result;
                const tx = db.transaction("opts", "readwrite");
                const store = tx.objectStore("opts");
                store.put({ key: "bootstrap-fs", value: "false" });
            };

            req.onerror = (e) => console.warn("IndexedDB failed:", e);
        } catch (e) {
            console.warn("IndexedDB not available:", e);
        }

        localStorage.setItem('checked', 'true');
    }
}

async function setupXen() {
    try {
        //@ts-ignore
        window.modules = {};
        const ComlinkPath = '/libs/comlink/esm/comlink.min.mjs';
        window.modules.Comlink = await import(ComlinkPath);

        const xen = new Xen();
        window.xen = xen;

        await xen.net.init();
        await xen.p2p.init();
        await xen.vfs.init();
        xen.repos.init();
        await xen.init();

        window.shared = { xen };
        console.log("Xen initialized successfully");
    } catch (e) {
        console.error("Failed to initialize Xen:", e);
    }
}

async function isOobe() {
    try {
        if (!window.xen.settings.get('oobe')) {
            await update();
            window.xen.settings.set('oobe', true);
            window.xen.settings.set('build-cache', window.xen.version.build);
            location.reload();
        }
    } catch (e) {
        console.warn("OOBE check failed:", e);
    }
}

async function createSw() {
    try {
        if (!('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
        await initSw();
    } catch (e) {
        console.warn("Service Worker init failed (likely blocked on Chromebook):", e);
    }
}

function setupScramjet() {
    try {
        //@ts-ignore
        const { ScramjetController } = $scramjetLoadController();

        const scramjet = new ScramjetController({
            files: {
                wasm: "/libs/sj/scramjet.wasm.wasm",
                all: "/libs/sj/scramjet.all.js",
                sync: "/libs/sj/scramjet.sync.js",
            },
        });

        scramjet.init();
        //@ts-ignore
        window.scramjet = scramjet;
        console.log("Scramjet initialized successfully");
    } catch (e) {
        console.error("Scramjet failed to initialize:", e);
    }
}

function createTransport() {
    try {
        const connection = new window.BareMux.BareMuxConnection('/libs/bare-mux/worker.js');
        //@ts-ignore
        connection.setRemoteTransport(new XenTransport(), 'XenTransport');
        console.log("Transport created");
    } catch (e) {
        console.warn("BareMux transport failed:", e);
    }
}

async function uiInit() {
    try {
        window.xen.wallpaper.set();
        window.addEventListener('resize', () => window.xen.wm.handleWindowResize());
        window.xen.taskBar.init();
        window.xen.taskBar.create();
        window.xen.taskBar.appLauncher.init();

        window.xen.wm.onCreated = () => window.xen.taskBar.onWindowCreated();
        window.xen.wm.onClosed = () => window.xen.taskBar.onWindowClosed();

        await window.xen.taskBar.loadPinnedEntries();
        window.xen.taskBar.render();
    } catch (e) {
        console.warn("UI initialization failed:", e);
    }
}

window.addEventListener('load', async () => {
    const splash = bootSplash();
    (window as any).bootSplash = splash;

    await parseArgs();
    await setupXen();
    await isOobe();
    setupScramjet();
    await createSw();
    createTransport();
    await window.xen.initSystem();
    await uiInit();

    document.addEventListener('contextmenu', e => e.preventDefault());

    setTimeout(() => {
        splash.element.style.opacity = "0";
        splash.element.addEventListener("transitionend", () => splash.element.remove());
    }, 600);

    if (DEBUG) {
        //@ts-ignore
        window.ChiiDevtoolsIframe = window.xen.wm.create({ url: 'https://example.com' }).el.content;

        const pm = window.postMessage;
        window.postMessage = (msg, origin) => pm.call(window, msg, origin);

        const script = document.createElement('script');
        script.src = '/chii/target.js';
        script.setAttribute('embedded', 'true');
        document.body.appendChild(script);
    }
});
