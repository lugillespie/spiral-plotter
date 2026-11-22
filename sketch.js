// TO THINK ABOUT
    // can it replicate wheel throwing? vibrations? idk

// tracking what grid square user is on (navigated with arrow keys)
let cursorX = 0;
let cursorY = 1;

// grid dimensions
const cols = 4;
const rows = 3;

// stop and play button variable
let stopVar = true

// one hit btn
let oneHitAlphaVal = 0;

// pen variable - is the pen up or down
let penHeld = false;

// recording variables
let micStream = null;
let audioContext;
let analyser;
let micSource;
let audioData;

let mediaRecorder;
let audioChunks = [];

let recordedAudio = null;
let isRecording = false;
let isStarting = false; // true while waiting on mic permission
let recordStartTime = 0;
let stopTimer = null;

// waveform display/playback
let waveFrames = []; // [{ t: ms since record start, level: 0-1 }]
let isAnimatingWave = false;

const sampleLen = 2000;
const sampleGain = 4; // the RMS values are small so they are scaled up with gain

// plotter vars
const plotterWsURL = "ws://10.100.11.73:8181";
const plotterPenNum = 4;
const plotterCX = 5000;
const plotterCY = 3750;
const plotterDrawingScale = 60; // plotter "units" per spiral unit (60 -> spiral is 5400 tall)

let plotterOn = false; // toggle for connecting to websocket
let socket = null;

// spiral drawn on screen 
const SVG_NS = "http://www.w3.org/2000/svg";
let spiralSvg;           // the <svg> element that sits on top of box 8
let spiralGuide;         // the clean spiral shown before printing
let spiralLines;         // <g> that holds every drawn segment
let spiralPoints = [];   // the ideal spiral, as a list of points
let spiralIndex = 0;     // which spiral point we're planning next
let plotBuffer = [];     // segments planned but not drawn yet
let penX = 0;            // where the pen currently is
let penY = 0;
let printing = false;
const PLOT_EVERY = 4; // plot one segment every N frames (bigger = slower)
const WOBBLE_SPEED = 0.08;

// hears the sound after the effects chain
let outputAnalyser;
let outputData;

const BUFFER_SIZE = 8;   // bigger = more lag between sound and drawing
const BASE_JITTER = 0.15; // wobble even in silence, so it always looks hand drawn
const MAX_JITTER = 3;     // extra wobble at full volume

// effects applied to sound
let effects = [];
let sampleSource = null;

function setup() {
    createCanvas(windowWidth, windowHeight);
    buildEffects();

    outputAnalyser = getAudioContext().createAnalyser();
    outputAnalyser.fftSize = 1024;
    outputData = new Float32Array(outputAnalyser.fftSize);

    buildSpiral();
    createSpiralSvg();
    positionSpiralSvg();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    positionSpiralSvg();
}

function draw() {
    background(220);

    samplePlayback();

    // capture a waveform snapshot while recording
    if (isRecording && analyser) {
        analyser.getFloatTimeDomainData(audioData);

        // RMS = loudness of THIS HERE frame - rms is root mean squared
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);

        waveFrames.push({
            t: millis() - recordStartTime,
            level: rms
        });
    }

    // red circle recording indicator
    if (isRecording) {
        fill("#D85D4C");
        noStroke();
        circle((width / cols) -24 , (height / rows) -24, width / 70);// GO HERE
    }

    // draw grid lines
    stroke(0);
    strokeWeight(1);

    for (let i = 1; i < cols; i++) {
        line(i * width / cols, 0, i * width / cols, height);
    }

    for (let i = 1; i < rows; i++) {
        line(0, i * height / rows, width, i * height / rows);
    }

    // highlight current cursor cell
    noFill();
    stroke(0);
    strokeWeight(3);

    rectMode(CORNER);

    rect(
        cursorX * (width / cols),
        cursorY * (height / rows),
        width / cols,
        height / rows
    );

    // draw the audio wave
    drawWaveform();

    // set grib labels
    fill(0);
    noStroke();
    textFont('TerminalGrotesque');
    textSize(20);
    textAlign(LEFT, BOTTOM);
    let labelArr = ["record", (penHeld ? "pen up" : "pen down"), stopVar ? "play" : "stop",
                                         "one hit", "1", "2", "3", "4", "5", "6", "7", "8"]
    for (let i = 0; i < cols * rows; i++) {
        let col = i % cols;
        let row = floor(i / cols);

        let x = col * (width / cols);
        let y = (row + 1) * (height / rows);

        let label = labelArr[i];

        // TODO: refactor effects situation
        if (i >= 4 && effects[i - 4]) label = effects[i - 4].name;

        if (i === 11) label = "plotter";
        text(label, x + 12, y - 12);

    }



    // is pen held button down draw circle
    if (penHeld) {
        let x = 1 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill("#F5E86C");
        noStroke();
        circle(x, y, width / 8);
    }

    // change square color for toggle play/stop 
    {
        let x = 2 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill(stopVar ? "#36549B" : "#D96A9E");
        noStroke();
        square(x - width / 16, y - width / 16, width / 8);
    }

    // reveal square on a one hit
    if (oneHitAlphaVal > 0) {
        let x = 3 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill(60, 124, 73, oneHitAlphaVal);
        noStroke();
        square(x - width / 16, y - width / 16, width / 8);

        oneHitAlphaVal = max(0, oneHitAlphaVal - 255 / (2 * 60));
    }

    // effect amount bars at the top of each effect box
    // TODO: Refactor effect display
    for (let i = 0; i < effects.length; i++) {
        const cell = i + 4;
        const x = (cell % cols) * (width / cols);
        const y = floor(cell / cols) * (height / rows);
        const barW = width / cols - 24;

        noFill();
        stroke(0);
        strokeWeight(1);
        rect(x + 12, y + 12, barW, 8);

        noStroke();
        fill(0);
        rect(x + 12, y + 12, barW * effects[i].amount, 8);
    }

    updatePlot();
    drawPrintButton();
    drawPlotterToggle();
}

function keyPressed() {
    let index = cursorY * cols + cursorX;

    if (key === '1') {
        startRecording();
    } else if (key === '2' && !penHeld) {
        penHeld = true;
    } else if (key === '3') {
        stopVar = !stopVar;

        // stopVar false = looping (label reads "stop"), true = not looping and label reads "play"
        if (!stopVar) {
            startLoop();
        } else {
            stopLoop();
        }
    } else if (key === '4') {
        oneHitAlphaVal = 255

        if (recordedAudio && !isRecording && !isStarting) {
            playSample();
        }
    }

    else if (key === 'ArrowDown') {
        moveCursorDown()
    } else if (key === 'ArrowUp') {
        moveCursorUp()
    } else if (key === 'ArrowLeft') {
        moveCursorBack()
    } else if (key === 'ArrowRight') {
        advanceCursor()
    } else if (key === "Backspace" || keyCode === 8) {
        if (cursorX > 0 || cursorY > 0) {
            moveCursorBack();
            index = cursorY * cols + cursorX;
        }
    } else if (key === '[') {
        changeEffect(index, -0.1);
    } else if (key === ']') {
        changeEffect(index, 0.1);
    } else if (key === 'Enter' && index === 11) {
        togglePrint();
    }
}

function keyReleased() {
    if (key === '2') {
        penHeld = false;
    }
}

// audio recording functions
async function startRecording() {
    if (isRecording || isStarting) return;
    isStarting = true;

    try {
        await userStartAudio();

        // stop any playback / loop in progress
        stopVar = true;
        stopLoop();

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = getAudioContext();
        micSource = audioContext.createMediaStreamSource(micStream);

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        micSource.connect(analyser);

        audioData = new Float32Array(analyser.fftSize);

        audioChunks = [];
        waveFrames = [];

        mediaRecorder = new MediaRecorder(micStream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });

            if (recordedAudio) {
                URL.revokeObjectURL(recordedAudio.src);
            }

            recordedAudio = new Audio(URL.createObjectURL(blob));
            recordedAudio.preload = "auto";

            // route the new audio element through the effects chain
            if (sampleSource) sampleSource.disconnect();
            sampleSource = audioContext.createMediaElementSource(recordedAudio);
            connectChain(sampleSource);

            recordedAudio.onended = () => {
                if (!stopVar) playSample();       // still looping
                else isAnimatingWave = false;
            };
        };

        mediaRecorder.start();
        recordStartTime = millis();
        isRecording = true;

        // hard stop after 2 seconds (works even if draw() is throttled)
        stopTimer = setTimeout(stopRecording, sampleLen);
    } catch (err) {
        console.error("Could not start recording:", err);
        releaseMic();
    } finally {
        isStarting = false;
    }
}

function releaseMic() {
    if (micSource) {
        micSource.disconnect();
        micSource = null;
    }

    if (analyser) {
        analyser.disconnect();
        analyser = null;
    }

    // stopping the tracks is what actually turns the mic off
    if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
        micStream = null;
    }
}

function stopRecording() {
    if (!isRecording) return;

    isRecording = false;
    clearTimeout(stopTimer);

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    releaseMic();
}


function playSample() {
    recordedAudio.volume = 1;
    recordedAudio.currentTime = 0;
    recordedAudio.play()
        .then(() => { isAnimatingWave = true; })
        .catch((err) => {
            console.error("Playback failed:", err);
            stopVar = true;
        });
}

/*
    a function that asks "should the audio file be playing?"
    uses recordedAudio, 
*/
function samplePlayback() {
    if (!recordedAudio || recordedAudio.paused) return;

    const now = recordedAudio.currentTime * 1000;

    // reached the end of the 2 seconds: loop or stop
    if (now >= sampleLen) {
        if (!stopVar) {
            recordedAudio.currentTime = 0;
        } else {
            recordedAudio.pause();
            isAnimatingWave = false;
        }
        return;
    }
}

function drawWaveform() {
    const cellW = width / cols;
    const cellH = height / rows;
    const xStart = cellW * 0.08;
    const xEnd = cellW - xStart;
    const centerY = cellH / 2;
    const amplitude = cellH * 0.3;

    const xOf = (f) => map(f.t, 0, sampleLen, xStart, xEnd);
    const yOf = (f) => centerY - min(f.level * sampleGain, 1) * amplitude;

    strokeWeight(2);

    // flat line only when there's no recording at all
    if (waveFrames.length < 2) {
        stroke(0);
        line(xStart, centerY, xEnd, centerY);
        return;
    }

    // during playback, only reveal frames the playhead has reached
    let visible = waveFrames;
    if (isAnimatingWave && recordedAudio) {
        let elapsed = recordedAudio.currentTime * 1000;

        // between loops the audio is seeking, paused, or ended for a moment:
        // hold the finished line instead of snapping to empty
        if (recordedAudio.seeking || recordedAudio.paused || recordedAudio.ended) {
            elapsed = sampleLen;
        }

        visible = waveFrames.filter((f) => f.t <= elapsed);
    }

    for (let i = 1; i < visible.length; i++) {
        const a = visible[i - 1];
        const b = visible[i];
        stroke(0);
        line(xOf(a), yOf(a), xOf(b), yOf(b));
    }
}

// for play and stop functions
function startLoop() {
    if (!recordedAudio || isRecording || isStarting) {
        stopVar = true;
        return;
    }
    playSample();
}

/*
    function that asks: is there an audio object? 
        if so, pause it and reset the playback position
        and toggle off the wave animation
*/
function stopLoop() {
    if (recordedAudio) {
        recordedAudio.pause();
        recordedAudio.currentTime = 0;
    }
    isAnimatingWave = false;
}

function advanceCursor() {
    cursorX++;

    if (cursorX >= cols) {
        cursorX = 0;
        cursorY++;
    }

    if (cursorY >= rows) {
        cursorY = rows - 1;
        cursorX = cols - 1;
    }
}

function moveCursorBack() {
    if (cursorX > 0) {
        cursorX--;
    } else if (cursorY > 1) {
        cursorY--;
        cursorX = cols - 1;
    }
}

function moveCursorUp() {
    if (cursorY > 1) {
        cursorY--;
    }
}

function moveCursorDown() {
    if (cursorY < rows - 1) {
        cursorY++;
    }
}

// each effect has: a name, an amount (0-1), an input node, an output node,
// and an update() function that turns amount into node settings
function buildEffects() {
    const ctx = getAudioContext();

    // 1: distortion (waveshaper blends a straight line into a hard curve)
    const shaper = ctx.createWaveShaper();
    shaper.oversample = "4x";
    effects[0] = {
        name: "distort", amount: 0, input: shaper, output: shaper,
        update(a) {
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = (i / 255) * 2 - 1;
                curve[i] = (1 - a) * x + a * Math.tanh(x * 20);
            }
            shaper.curve = curve;
        }
    };

    // 2: lowpass filter (20000 Hz = open, down to 200 Hz = muffled)
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 20000;
    effects[1] = {
        name: "lowpass", amount: 0, input: lowpass, output: lowpass,
        update(a) { lowpass.frequency.value = 20000 * Math.pow(0.01, a); }
    };

    // 3: highpass filter (20 Hz = open, up to 2000 Hz = thin)
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 20;
    effects[2] = {
        name: "highpass", amount: 0, input: highpass, output: highpass,
        update(a) { highpass.frequency.value = 20 * Math.pow(100, a); }
    };

    // 4: tremolo (a slow oscillator wobbles the volume)
    const tremolo = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 6;          // wobbles per second
    lfo.connect(lfoDepth);
    lfoDepth.connect(tremolo.gain);   // oscillator controls the gain
    lfo.start();
    effects[3] = {
        name: "tremolo", amount: 0, input: tremolo, output: tremolo,
        update(a) {
            tremolo.gain.value = 1 - a / 2;  // center of the wobble
            lfoDepth.gain.value = a / 2;     // size of the wobble
        }
    };

    // 5: echo (dry signal passes through, plus a delayed feedback copy)
    const echoIn = ctx.createGain();
    const echoOut = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    delay.delayTime.value = 0.25;
    feedback.gain.value = 0.4;
    wet.gain.value = 0;
    echoIn.connect(echoOut);          // dry path
    echoIn.connect(delay);            // wet path
    delay.connect(wet);
    wet.connect(echoOut);
    delay.connect(feedback);          // feedback loop
    feedback.connect(delay);
    effects[4] = {
        name: "echo", amount: 0, input: echoIn, output: echoOut,
        update(a) { wet.gain.value = a; }
    };

    // 6: reverb (convolver blends the sound with a fake "room")
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2, 3);   // 2 seconds long, decay of 3
    const reverbIn = ctx.createGain();
    const reverbOut = ctx.createGain();
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    reverbIn.connect(reverbOut);       // dry path
    reverbIn.connect(convolver);       // wet path
    convolver.connect(reverbWet);
    reverbWet.connect(reverbOut);
    effects[5] = {
        name: "reverb", amount: 0, input: reverbIn, output: reverbOut,
        update(a) { reverbWet.gain.value = a; }
    };

    // 7: bitcrusher (waveshaper snaps the volume to a few steps, like a low bit depth)
    const crusher = ctx.createWaveShaper();
    effects[6] = {
        name: "bitcrush", amount: 0, input: crusher, output: crusher,
        update(a) {
            const size = 8192;   // curve needs lots of points so the steps stay sharp
            const curve = new Float32Array(size);

            // amount 0 = straight line (no effect), up to 1 = only about 1 bit
            const bits = 12 - a * 11;
            const steps = Math.pow(2, bits) / 2;

            for (let i = 0; i < size; i++) {
                const x = (i / (size - 1)) * 2 - 1;      // input from -1 to 1
                curve[i] = a === 0 ? x : Math.round(x * steps) / steps;
            }
            crusher.curve = curve;
        }
    };
}

function connectChain(source) {
    let node = source;
    for (const fx of effects) {
        node.connect(fx.input);
        node = fx.output;
    }
    node.connect(outputAnalyser);                          // listen here
    outputAnalyser.connect(getAudioContext().destination); // then to speakers
}

function changeEffect(cellIndex, step) {
    const fx = effects[cellIndex - 4];   // boxes "1"-"8" start at grid index 4
    if (!fx) return;                      // empty box or the top row
    fx.amount = constrain(fx.amount + step, 0, 1);
    fx.update(fx.amount);
}

// builds a stereo buffer of random noise that fades out over time
function makeImpulse(ctx, seconds, decay) {
    const length = ctx.sampleRate * seconds;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            const fade = Math.pow(1 - i / length, decay);  // 1 -> 0 over time
            data[i] = (Math.random() * 2 - 1) * fade;
        }
    }
    return impulse;
}


function buildSpiral() {
    const turns = 15;
    const pointsPerTurn = 60;
    const total = turns * pointsPerTurn;

    for (let i = 0; i <= total; i++) {
        const angle = (i / pointsPerTurn) * TWO_PI;
        const radius = (i / total) * 45;   // grows from 0 to 45
        spiralPoints.push({
            x: 50 + radius * cos(angle),
            y: 50 + radius * sin(angle)
        });
    }
}

function createSpiralSvg() {
    spiralSvg = document.createElementNS(SVG_NS, "svg");
    spiralSvg.setAttribute("viewBox", "0 0 100 100");
    spiralSvg.setAttribute("fill", "none");
    spiralSvg.setAttribute("stroke", "black");
    spiralSvg.setAttribute("stroke-width", "0.6");
    spiralSvg.setAttribute("stroke-linecap", "round");
    spiralSvg.style.position = "absolute";
    spiralSvg.style.pointerEvents = "none";   // clicks and keys still reach the sketch

    // the clean spiral, shown until you press print
    spiralGuide = document.createElementNS(SVG_NS, "polyline");
    spiralGuide.setAttribute("points", spiralPoints.map((p) => p.x + "," + p.y).join(" "));
    spiralSvg.appendChild(spiralGuide);

    // the hand-drawn segments get added here
    spiralLines = document.createElementNS(SVG_NS, "g");
    spiralSvg.appendChild(spiralLines);

    document.body.appendChild(spiralSvg);
}

// svg is not part of the p5 canvas so needs to be positioned seperately
function positionSpiralSvg() {
    spiralSvg.style.left = (3 * width / cols) + "px";
    spiralSvg.style.top = (2 * height / rows) + "px";
    spiralSvg.style.width = (width / cols) + "px";
    spiralSvg.style.height = (height / rows - 50) + "px";
}

function togglePrint() {
    printing = !printing;

    if (printing) {
        noiseSeed(random(10000));

        // erase the spiral and start over
        spiralGuide.setAttribute("display", "none");
        spiralLines.replaceChildren();
        plotBuffer = [];
        spiralIndex = 0;
        penX = spiralPoints[0].x;
        penY = spiralPoints[0].y;

        // park at the middle of the page, then put the pen down
        sendPlotter("IN;");
        sendPlotter("SP" + plotterPenNum + ";");
        sendPlotter("PU" + toPlotterUnits(penX, penY) + ";");
        sendPlotter("PD;");
    } else {
        plotBuffer = [];   // stop: throw away anything not sent yet
        sendPlotter("PU;");
    }
}

// call this every frame from draw()
function updatePlot() {
    if (!printing) return;

    if (frameCount % PLOT_EVERY !== 0) return;   // skip frames to slow the plotter down

    const lastIndex = spiralPoints.length - 1;

    // PLAN: make the next segment, using the audio level right now
    if (spiralIndex < lastIndex) {
        spiralIndex++;
        plotBuffer.push(makeSegment(spiralPoints[spiralIndex]));
    }
    const planningDone = spiralIndex >= lastIndex;

    // SEND: the oldest segment leaves once the buffer is full.
    // When planning is done, empty out what's left.
    if (plotBuffer.length > BUFFER_SIZE || (planningDone && plotBuffer.length > 0)) {
        drawSegment(plotBuffer.shift());
    }

    // all done: the button flips back to "print"
    if (planningDone && plotBuffer.length === 0) {
        printing = false;
        sendPlotter("PU;");
    }
}

// one segment: a straight line from where the pen is to a (jittered) target
function makeSegment(target) {
    const level = min(outputLevel() * sampleGain, 1);          // 0..1
    const jitter = BASE_JITTER + level * MAX_JITTER;

    // smooth wobble: noise() drifts gradually instead of jumping around
    const wobbleX = (noise(spiralIndex * WOBBLE_SPEED, 0) - 0.5) * 2;     // -1..1
    const wobbleY = (noise(spiralIndex * WOBBLE_SPEED, 100) - 0.5) * 2;   // -1..1

    let x = target.x + wobbleX * jitter;
    let y = target.y + wobbleY * jitter;

    // effect -> drawing: the bitcrusher snaps the pen to a coarse grid
    const crush = effects[6] ? effects[6].amount : 0;
    if (crush > 0) {
        const grid = crush * 6;
        x = round(x / grid) * grid;
        y = round(y / grid) * grid;
    }

    const segment = { x1: penX, y1: penY, x2: x, y2: y };
    penX = x;   // the next segment starts where this one ended
    penY = y;
    return segment;
}

// the only place a segment becomes visible (and later, plotter code)
function drawSegment(seg) {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", seg.x1);
    el.setAttribute("y1", seg.y1);
    el.setAttribute("x2", seg.x2);
    el.setAttribute("y2", seg.y2);
    spiralLines.appendChild(el);

    sendPlotter("PA" + toPlotterUnits(seg.x2, seg.y2) + ";");
}

// loudness of the sound coming out of the effects chain (same RMS idea as recording)
function outputLevel() {
    outputAnalyser.getFloatTimeDomainData(outputData);
    let sum = 0;
    for (let i = 0; i < outputData.length; i++) {
        sum += outputData[i] * outputData[i];
    }
    return Math.sqrt(sum / outputData.length);
}

// where the button sits: bottom right corner of box 8
function printButton() {
    const w = 90;
    const h = 30;
    return { x: width - w - 12, y: height - h - 12, w: w, h: h };
}

function drawPrintButton() {
    const b = printButton();

    stroke(0);
    strokeWeight(2);
    fill(printing ? "#D85D4C" : 255);
    rect(b.x, b.y, b.w, b.h);

    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    text(printing ? "stop" : "print", b.x + b.w / 2, b.y + b.h / 2);
}

function inside(b) {
    return mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h;
}

function mousePressed() {
    if (inside(printButton())) togglePrint();
    if (inside(plotterToggle())) togglePlotter();
}

// spiral units (0-100, y down) -> plotter units (origin bottom-left, y up)
// the spiral's center (50, 50) lands on the center of the page
function toPlotterUnits(x, y) {
    const px = round(constrain(plotterCX + (x - 50) * plotterDrawingScale, 0, 10000));
    const py = round(constrain(plotterCY - (y - 50) * plotterDrawingScale, 0, 7500));
    return px + "," + py;
}

// sends a message only if the plotter is connected, otherwise does nothing
function sendPlotter(text) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(text);
    }
}

function togglePlotter() {
    if (printing) return;   // decide before you press print, not during

    plotterOn = !plotterOn;

    if (plotterOn) {
        const s = new WebSocket(plotterWsURL);
        socket = s;
        s.onclose = () => {
            if (socket === s) {
                plotterOn = false;
                socket = null;
            }
        };
    } else {
        sendPlotter("PU;");       // lift the pen before hanging up
        const s = socket;
        socket = null;
        s.close();
    }
}

// sits just left of the print button
function plotterToggle() {
    const b = printButton();
    return { x: b.x - 56 - 8, y: b.y, w: 56, h: b.h };
}

function drawPlotterToggle() {
    const t = plotterToggle();
    const connecting = socket && socket.readyState === WebSocket.CONNECTING;

    stroke(0);
    strokeWeight(2);
    fill(plotterOn ? (connecting ? "#F5E86C" : "#7FC48F") : 255);
    rect(t.x, t.y, t.w, t.h);

    // knob on the left when off, right when on
    const knobX = plotterOn ? t.x + t.w - 22 : t.x + 4;
    fill(0);
    noStroke();
    rect(knobX, t.y + 4, 18, t.h - 8);

    // text in the empty half of the switch
    const textX = plotterOn ? t.x + 14 : t.x + t.w - 16;
    textAlign(CENTER, CENTER);
    text(plotterOn ? (connecting ? "..." : "on") : "off", textX, t.y + t.h / 2);
}