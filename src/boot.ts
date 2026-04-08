import { Xen } from "./Xen";
import { XenTransport } from "./core/Transport";
import { update } from "./core/update";
import { bootSplash } from "./ui/bootSplash";

let DEBUG = false;

// ---------- Helpers ----------
async function safeImport(path: string) {
    try {
        return await import(path);
    } catch (e) {
        console.warn(`Failed to import ${path}:`, e);
        return null;
    }
}

async function safeInitXen() {
    try {
        //@ts-ignore
        window.modules = {};
        const Comlink = await safeImport('/libs/comlink/esm/comlink.min.mjs');
        if (!Comlink) return null;

        const xen = new Xen();
        window.xen = xen;

        await xen.net.init();
        await xen.p2p.init();
        await xen.vfs.init();
        xen.repos.init();
        await xen.init();
        window.shared = { xen };

        return xen;
    } catch (e) {
        console.error("Xen initialization failed:", e);
        return null;
    }
}

async function safeInitScramjet() {
    try {
        //@ts-ignore
        if (typeof $scramjetLoadController !== 'function') throw "Scramjet loader not found";

        //@ts-ignore
        const { ScramjetController } = $scramjetLoadController();
        const sj = new ScramjetController({
            files: {
                wasm: "/libs/sj/scramjet.wasm.wasm",
                all: "/libs/sj/scramjet.all.js",
                sync: "/libs/sj/scramjet.sync.js",
            },
        });
        sj.init();
        //@ts-ignore
        window.scramjet = sj;
        return true;
    } catch (e) {
        console.warn("Scramjet failed:", e);
        return false;
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

async function initUI(xen: Xen, splash: any) {
    try {
        xen.wallpaper.set();
        window.addEventListener('resize', () => xen.wm.handleWindowResize());

        xen.taskBar.init();
        xen.taskBar.create();
        xen.taskBar.appLauncher.init();

        xen.wm.onCreated = () => xen.taskBar.onWindowCreated();
        xen.wm.onClosed = () => xen.taskBar.onWindowClosed();

        await xen.taskBar.loadPinnedEntries();
        xen.taskBar.render();

        splash.setMessage("Apps loaded successfully");
    } catch (e) {
        console.warn("UI initialization failed:", e);
        splash.setMessage("UI failed to load. Check console.");
    }
}

// ---------- Main Boot ----------
async function boot() {
    const splash = bootSplash();
    (window as any).bootSplash = splash;

    // Parse URL args
    const args = new URLSearchParams(window.location.search);
    DEBUG = args.get('debug') === 'true';

    splash.setMessage("Initializing Xen...");
    const xen = await safeInitXen();
    if (!xen) {
        splash.setMessage("Failed to initialize Xen. Apps may not appear.");
        return;
    }

    splash.setMessage("Initializing Scramjet...");
    await safeInitScramjet();

    splash.setMessage("Creating Transport...");
    createTransport();

    splash.setMessage("Initializing UI...");
    await initUI(xen, splash);

    // Fade out splash
    setTimeout(() => {
        splash.element.style.opacity = "0";
        splash.element.addEventListener("transitionend", () => splash.element.remove());
    }, 600);

    // Context menu disabled
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Debug devtools
    if (DEBUG) {
        //@ts-ignore
        window.ChiiDevtoolsIframe = xen.wm.create({ url: 'https://example.com' }).el.content;

        const pm = window.postMessage;
        window.postMessage = (msg, origin) => pm.call(window, msg, origin);

        const script = document.createElement('script');
        script.src = '/chii/target.js';
        script.setAttribute('embedded', 'true');
        document.body.appendChild(script);
    }
}

// Start boot on window load
window.addEventListener('load', boot);
