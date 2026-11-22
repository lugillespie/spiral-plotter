// plotout.js — turns the live waveform into plotter output (SVG or HP-GL)
const OUT_W = 640, OUT_H = 480;       // output space, y down
const PLOT_W = 10000, PLOT_H = 7500;  // plotter units, y up
const WAVE_W = 120;                   // how wide the drawn wave is
const WAVE_AMP = 36;                  // how tall a full-scale level is
const ORIGIN_STEP = 10;

const plotOut = (() => {
    let ws = null;
    let origin = { x: 50, y: 50 };   // where the wave starts (left end, baseline)
    let pass = null;                  // state of the current sweep, null when idle
    let lastSvg = '';

    function connect(url) {
        ws = new WebSocket(url);
        ws.onclose = () => setTimeout(() => connect(url), 2000); // keep retrying
        ws.onerror = () => ws.close();
    }

    function send(text) {
        if (ws && ws.readyState === 1) ws.send(text);
    }

    function moveOrigin(dx, dy) {
        origin.x = Math.min(OUT_W - WAVE_W, Math.max(0, origin.x + dx));
        origin.y = Math.min(OUT_H, Math.max(WAVE_AMP, origin.y + dy));
    }

    const toPlu = ({ x, y }) => ({
        x: Math.round(Math.min(Math.max(x, 0), OUT_W) / OUT_W * PLOT_W),
        y: Math.round((1 - Math.min(Math.max(y, 0), OUT_H) / OUT_H) * PLOT_H),
    });

    function update({ mode, frames, playheadMs, active, duration, gain }) {
        if (!active || frames.length < 2) {
            if (pass) endPass(mode);
            return;
        }
        // playhead jumping backwards = loop wrapped (or one-hit retriggered)
        if (!pass || playheadMs < pass.lastMs) {
            if (pass) endPass(mode);
            pass = { origin: { ...origin }, next: 1, down: false, lastMs: 0 };
        }
        pass.lastMs = playheadMs;

        const pt = (f) => ({
            x: pass.origin.x + f.t / duration * WAVE_W,
            y: pass.origin.y - Math.min(f.level * gain, 1) * WAVE_AMP,
        });

        if (mode === 'hpgl') sendHpgl(frames, playheadMs, pt);
        else sendSvg(frames, playheadMs, pt);
    }

    function endPass(mode) {
        if (mode === 'hpgl' && pass.down) send('PU;');
        if (mode === 'svg') send('COMMIT');   // tell the viewer to freeze this pass
        pass = null;
        lastSvg = '';
    }

    // segment a→b is inked only if b is still pen-down (same rule as drawWaveform)
    function sendSvg(frames, playheadMs, pt) {
        const paths = [];
        let cur = null;
        for (let i = 1; i < frames.length && frames[i].t <= playheadMs; i++) {
            if (frames[i].pen) {
                if (!cur) { cur = [pt(frames[i - 1])]; paths.push(cur); }
                cur.push(pt(frames[i]));
            } else {
                cur = null;
            }
        }
        const d = paths.map((p) =>
            'M' + p.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L')).join(' ');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OUT_W} ${OUT_H}">` +
            `<path d="${d}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        if (svg !== lastSvg) { lastSvg = svg; send(svg); }
    }

    // only the frames the playhead has reached since last time
    function sendHpgl(frames, playheadMs, pt) {
        let run = [];
        const flush = () => {
            if (run.length) send(`PA${run.map(({ x, y }) => `${x},${y}`).join(',')};`);
            run = [];
        };
        let i = pass.next;
        for (; i < frames.length && frames[i].t <= playheadMs; i++) {
            if (frames[i].pen) {
                if (!pass.down) {
                    const a = toPlu(pt(frames[i - 1]));
                    send(`PU${a.x},${a.y};`);
                    send('PD;');
                    pass.down = true;
                }
                run.push(toPlu(pt(frames[i])));
            } else if (pass.down) {
                flush();
                send('PU;');
                pass.down = false;
            }
        }
        flush();
        pass.next = i;
    }

    return { connect, update, moveOrigin };
})();