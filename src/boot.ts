import { Xen } from "./Xen";
import { XenTransport } from "./core/Transport";
import { bootSplash } from "./ui/bootSplash";

// ---------- Helper to show messages on the splash ----------
function updateSplashMessage(splash: any, msg: string) {
    if (!splash) return;
    const el = splash.element || splash;
    if (!el) return;

    let msgEl = el.querySelector('.boot-message') as HTMLDivElement;
    if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.className = 'boot-message';
        msgEl.style.position = 'absolute';
        msgEl.style.bottom = '10px';
        msgEl.style.width = '100%';
        msgEl.style.textAlign = 'center';
        msgEl.style.color = '#fff';
        msgEl.style.fontFamily = 'sans-serif';
        msgEl.style.fontSize = '14px';
        el.appendChild(msgEl);
    }
    msgEl.innerText = msg;
}

// ---------- Safe import wrapper ----------
async function safeImport(path: string) {
    try {
        return await import(path);
    } catch (e) {
        console.warn(`Failed to import ${path}:`, e);
        return null;
    }
}

// ---------- Safe Xen initialization ----------
async function safeInitXen(splash: any) {
    try {
        updateSplashMessage(splash, "Initializing Xen...");
        //@ts-ignore
        window.modules = {};
        if (!window.modules.Comlink) {
            window.modules.Comlink = await safeImport('/libs/comlink/esm/comlink.min.mjs');
        }

        const xen = new Xen();
        window.xen = xen;

        await xen.net?.init().catch(e => console.warn("Net init failed:", e));
        await xen.p2p?.init().catch(e => console.warn("P2P init failed:", e));
        await xen.vfs?.init().catch(e => console.warn("VFS init failed:", e));
        xen.repos?.init?.();
        await xen.init?.().catch(e => console.warn("Xen init failed:", e));

        window.shared = { xen };
        updateSplashMessage(splash, "Xen initialized");
        return xen;
    } catch (e) {
        console.error("Xen setup failed:", e);
        updateSplashMessage(splash, "Xen failed, limited UI");
        return null;
    }
}

// ---------- Safe Scramjet initialization ----------
async function safeInitScramjet(splash: any) {
    try {
        updateSplashMessage(splash, "Initializing Scramjet...");
        //@ts-ignore
        if (typeof $scramjetLoadController === 'function') {
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
            updateSplashMessage(splash, "Scramjet ready");
        } else {
            console.warn("Scramjet loader not found");
        }
    } catch (e) {
        console.warn("Scramjet failed:", e);
        updateSplashMessage(splash, "Scramjet failed, continuing...");
    }
}

// ---------- Safe Transport setup ----------
function safeCreateTransport(splash: any) {
    try {
        updateSplashMessage(splash, "Creating Transport...");
        if (window.BareMux?.BareMuxConnection) {
            const conn = new window.BareMux.BareMuxConnection('/libs/bare-mux/worker.js');
            //@ts-ignore
            conn.setRemoteTransport(new XenTransport(), 'XenTransport');
            updateSplashMessage(splash, "Transport ready");
        } else {
            console.warn("BareMux not available");
            updateSplashMessage(splash, "Transport unavailable");
        }
    } catch (e) {
        console.warn("Transport failed:", e);
        updateSplashMessage(splash, "Transport failed, continuing...");
    }
}

// ---------- UI initialization ----------
async function safeInitUI(xen: any, splash: any) {
    try {
        if (!xen) {
            updateSplashMessage(splash, "Xen unavailable, UI limited");
            return;
        }

        updateSplashMessage(splash, "Initializing UI...");
        xen.wallpaper?.set();
        window.addEventListener('resize', () => xen.wm?.handleWindowResize());

        xen.taskBar?.init?.();
        xen.taskBar?.create?.();
        xen.taskBar?.appLauncher?.init?.();

        xen.wm.onCreated = () => xen.taskBar?.onWindowCreated?.();
        xen.wm.onClosed = () => xen.taskBar?.onWindowClosed?.();

        await xen.taskBar?.loadPinnedEntries?.().catch(e => console.warn("TaskBar load failed:", e));
        xen.taskBar?.render?.();
        updateSplashMessage(splash, "UI ready, apps loaded");
    } catch (e) {
        console.warn("UI init failed:", e);
        updateSplashMessage(splash, "UI failed, limited apps");
    }
}

// ---------- Main boot ----------
window.addEventListener('load', async () => {
    const splash = bootSplash();
    (window as any).bootSplash = splash;

    // Parse debug arg
    const args = new URLSearchParams(window.location.search);
    const DEBUG = args.get('debug') === 'true';

    const xen = await safeInitXen(splash);
    await safeInitScramjet(splash);
    safeCreateTransport(splash);
    await safeInitUI(xen, splash);

    // Fade out splash
    setTimeout(() => {
        splash.element.style.opacity = "0";
        splash.element.addEventListener("transitionend", () => splash.element.remove());
    }, 800);

    // Disable right-click
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Debug devtools
    if (DEBUG && xen) {
        //@ts-ignore
        window.ChiiDevtoolsIframe = xen.wm.create({ url: 'https://example.com' }).el.content;

        const pm = window.postMessage;
        window.postMessage = (msg, origin) => pm.call(window, msg, origin);

        const script = document.createElement('script');
        script.src = '/chii/target.js';
        script.setAttribute('embedded', 'true');
        document.body.appendChild(script);
    }
});
