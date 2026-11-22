let cursorX = 0;
let cursorY = 1;

const cols = 4;
const rows = 3;
let shapes = Array(cols * rows).fill(null);

// stop and play button variable
let stopVar = true;

// one hit btn
let oneHitAlphaVal = 0;

// pen variables
let penHeld = false;

// p5.sound objects
let mic, delay, filter;
let recorder, soundFile;

// recording state
let isRecording = false;
let isStarting = false; // true while waiting on mic permission
let hasRecording = false;
let recordStartTime = 0;

// waveform display/playback
let waveFrames = []; // [{ t: ms since record start, level: 0..1 }]
let isAnimatingWave = false;

const RECORD_DURATION = 2000;
const GAIN = 10; // levels are small, scale them up for display

function setup() {
    createCanvas(windowWidth, windowHeight);

    mic = new p5.AudioIn();
    recorder = new p5.SoundRecorder();
}

function startRecording() {
    if (isRecording || isStarting) return;
    isStarting = true;

    // stop any playback or loop in progress
    stopVar = true;
    stopLoop();

    userStartAudio()
        .then(() => {
            mic.start(onMicReady, onMicError);
        })
        .catch(onMicError);
}

function onMicReady() {
    // fresh SoundFile each take so the old one is never mutated mid-playback
    const newFile = new p5.SoundFile();

    recorder.setInput(mic);
    waveFrames = [];
    recordStartTime = millis();
    isRecording = true;
    isStarting = false;

    // records for RECORD_DURATION seconds, then fills newFile and calls back
    recorder.record(newFile, RECORD_DURATION / 1000, () => {
        isRecording = false;
        mic.stop(); // releases the mic stream

        if (soundFile) soundFile.dispose();
        soundFile = newFile;
        soundFile.playMode("restart");
        soundFile.onended(() => {
            isAnimatingWave = false;
        });
        hasRecording = true;
    });
}

function onMicError(err) {
    console.error("Could not start recording:", err);
    isStarting = false;
    isRecording = false;
    mic.stop();
}

function startLoop() {
    // nothing to loop yet (or still recording): undo the toggle
    if (!hasRecording || isRecording || isStarting) {
        stopVar = true;
        return;
    }

    soundFile.loop();
    isAnimatingWave = true;
}

function stopLoop() {
    if (soundFile) {
        soundFile.setLoop(false);
        soundFile.stop();
    }

    // go back to showing the full wave
    isAnimatingWave = false;
}

function playOneHit() {
    if (!hasRecording || isRecording || isStarting) return;

    soundFile.setLoop(false);
    soundFile.play();
    isAnimatingWave = true;
}

function draw() {
    background(220);

    // capture a level snapshot while recording
    if (isRecording) {
        const t = millis() - recordStartTime;
        if (t <= RECORD_DURATION) {
            waveFrames.push({ t: t, level: mic.getLevel(0) });
        }
    }

    if (isRecording) {
        fill("#D85D4C");
        noStroke();
        circle((width / cols) - 24, (height / rows) - 24, width / 70);
    }

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

    drawWaveform();

    // set grid labels
    fill(0);
    noStroke();
    textFont('TerminalGrotesque');
    textSize(20);
    textAlign(LEFT, BOTTOM);
    let labelArr = ["record", (penHeld ? "pen up" : "pen down"), stopVar ? "play" : "stop",
                    "one hit", "1", "2", "3", "4", "5", "6", "7", "8"];
    for (let i = 0; i < cols * rows; i++) {
        let col = i % cols;
        let row = floor(i / cols);

        let x = col * (width / cols);
        let y = (row + 1) * (height / rows);

        text(labelArr[i], x + 12, y - 12);
    }

    // is pen held button down
    if (penHeld) {
        let x = 1 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill("#F5E86C");
        noStroke();
        circle(x, y, width / 8);
    }

    // toggle play or stop
    {
        let x = 2 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill(stopVar ? "#36549B" : "#D96A9E");
        noStroke();
        square(x - width / 16, y - width / 16, width / 8);
    }

    // play a one hit
    if (oneHitAlphaVal > 0) {
        let x = 3 * width / cols + width / cols / 2;
        let y = 0 * height / rows + height / rows / 2;

        fill(60, 124, 73, oneHitAlphaVal);
        noStroke();
        square(x - width / 16, y - width / 16, width / 8);

        oneHitAlphaVal = max(0, oneHitAlphaVal - 255 / (2 * 60));
    }
}

function drawWaveform() {
    const cellW = width / cols;
    const cellH = height / rows;

    const xStart = cellW * 0.08;
    const xEnd = cellW - xStart;

    const centerY = cellH / 2;
    const amplitude = cellH * 0.3;

    // how much of the envelope to show
    let visible = waveFrames;

    if (isAnimatingWave && hasRecording && soundFile.isPlaying()) {
        // playback: reveal points as the SoundFile's clock reaches them
        const elapsed = soundFile.currentTime() * 1000;
        visible = waveFrames.filter((f) => f.t <= elapsed);
    }
    // while recording or idle: show everything captured so far

    stroke(0);
    strokeWeight(2);
    noFill();

    if (visible.length < 2) {
        // flat line when there's nothing to show yet
        line(xStart, centerY, xEnd, centerY);
        return;
    }

    // x = time across the 2 seconds, y = loudness
    const xOf = (f) => map(f.t, 0, RECORD_DURATION, xStart, xEnd);
    const hOf = (f) => min(f.level * GAIN, 1) * amplitude;

    beginShape();
    for (const f of visible) vertex(xOf(f), centerY - hOf(f));
    endShape();
}

function keyPressed() {
    let index = cursorY * cols + cursorX;

    if (key === '1') {
        startRecording();
    } else if (key === '2' && !penHeld) {
        penHeld = true;
    } else if (key === '3') {
        stopVar = !stopVar;

        // stopVar false = looping (label reads "stop"), true = not looping (label reads "play")
        if (!stopVar) {
            startLoop();
        } else {
            stopLoop();
        }
    } else if (key === '4') {
        oneHitAlphaVal = 255;
        playOneHit();
    } else if (key === 'ArrowDown') {
        moveCursorDown();
    } else if (key === 'ArrowUp') {
        moveCursorUp();
    } else if (key === 'ArrowLeft') {
        moveCursorBack();
    } else if (key === 'ArrowRight') {
        advanceCursor();
    } else if (key === "Backspace" || keyCode === 8) {
        if (shapes[index] != null) {
            shapes[index] = null;
        } else if (cursorX > 0 || cursorY > 0) {
            moveCursorBack();
            index = cursorY * cols + cursorX;
            shapes[index] = null;
        }
    }
}

function keyReleased() {
    if (key === '2') {
        penHeld = false;
    }
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

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}