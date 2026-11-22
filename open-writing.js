let cursorX = 0;
let cursorY = 0;

const cols = 4;
const rows = 3;
let shapes = Array(cols * rows).fill(null);

let playVar = "play"

// pen variables
let penHeld = false;
let penX = 0;
let penY = 0;

// coordinate variables 
let coordsTrackerOnGrid = false;
let coordsTrackerIndex = null;
let coordsArray = [null, null]

function setup() {
    createCanvas(windowWidth, windowHeight);
}

function draw() {
    background(220);

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

    fill(0);
    noStroke();
    textFont('TerminalGrotesque');
    textSize(20);
    textAlign(LEFT, BOTTOM);
    let labelArr = ["record", "pen " + String(penHeld), playVar,  "one hit", "1", "2", "3", "4", "5", "6", "7", "8"]

    for (let i = 0; i < cols * rows; i++) {
        let col = i % cols;
        let row = floor(i / cols);

        let x = col * (width / cols);
        let y = (row + 1) * (height / rows);

        text(labelArr[i], x + 12,y - 12);
    }

    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i] !== null) {
            let x = (i % cols) * width / cols + width / cols / 2;
            let y = floor(i / cols) * height / rows + height / rows / 2;
            
            if (shapes[i] === "inc") {
                // RULES: 
                    // if there is not a already an inc or dec on the screen, create a "coordinate set" (two boxes)
                    // if there is already one on the grid but the cursor is not there, do nothing
                    // when typing within the "coordinate area", cursor with toggle between the two squares
                
                
                fill("#36549B");
                noStroke();
                square(x - width/16, y - width/16, width/8);

                fill(0);
                textSize(24);
                textFont('TerminalGrotesque');
                textAlign(LEFT, CENTER);
                
                text("increaser", x - width/16, y - width/16);
            } else if (shapes[i] === "dec") {
                // RULES: 
                    // if there is not a already an inc or dec on the screen, create a "coordinate set" (two boxes)
                    // if there is already one on the grid but the cursor is not there, do nothing
                    // when typing within the "coordinate area", cursor with toggle between the two squares
                fill("#D96A9E");
                noStroke();
                square(x - width/16, y - width/16, width/8);

                fill(0);
                textSize(24);
                textFont('TerminalGrotesque');
                textAlign(LEFT, CENTER);
                
                text("decreaser", x - width/16, y - width/16);
            } else if (shapes[i] === "mic") {



                // TODO: shape that is a square with a little hole in the middle? idk

                // Draw the main square
                // fill(50, 100, 200);
                // noStroke();
                // square(width / 2, height / 2, 200);
                
                // // Erase only the circle
                // push();
                // erase();
                // circle(width / 2, height / 2, 80);
                // noErase();
                // pop();
            }
        }
    }

    // RULES:
    // outside of sampler
        // only shows on grid when held down
        // advances cursor
    // inside of sampler
        // static, gets placed once (catch bug for if held down)
    if (penHeld) {
        let x = penX * width / cols + width / cols / 2;
        let y = penY * height / rows + height / rows / 2;
    
        fill("#F5E86C");
        noStroke();
        circle(x, y, width / 8);

        fill(0);
        textSize(24);
        textFont('TerminalGrotesque');
        textAlign(LEFT, CENTER);
        
        text("pen down", x, y);
    }
}

function keyPressed() {
    let index = cursorY * cols + cursorX;

    if (key === '1' && !penHeld) {
        penHeld = true;
        penX = cursorX;
        penY = cursorY;

        // shapes[index] = "penDown";
        advanceCursor();
    } 
    // else if (key === '2') {
    //     // RULES;
    //         // when outside of the sampler
    //             // when held down with the pendown key, it is applied on top, wherever the pendown is on grid
    //         // when inside sampler
    //             // ???? 
    //     shapes[index] = "mic";
    //     advanceCursor();
    // } 
    else if (key === '2') {
        shapes[index] = "inc";
        advanceCursor();
    } else if (key === '3') {
        shapes[index] = "dec";
        advanceCursor();
    } 
    
    else if (key === '4') {
        // RULES:
            // outside of sampler
                // hold down the key, it shows up and holding it down or repeatedly pressing increases number
            // inside of sampler
                // same? i think?
        // IDEA
            // relative to sun position ? move one unit in the direction of the sun (inverse is moon? idk)
        shapes[index] = "coordX";
        advanceCursor();
    } else if (key === '5') {
        // RULES:
            // outside of sampler
                // hold down the key, it shows up and holding it down or repeatedly pressing increases number
            // inside of sampler
                // same? i think?
        shapes[index] = "coordY";
        advanceCursor();
    } else if (key === '6') {
        // RULES: 
            // right now, if you hold down inverser it only applies to coordx and coordy and decrements them
        shapes[index] = "inverser";
        advanceCursor();
    } else if (key === '7') {
        // RULES:
            // sends pen to specified coordinate
        shapes[index] = "go";
    } else if (key === '0') {
        // RULES:
            // shape shows up and lights up the next grid square purple
            // all typed out of that are within loop
            // loop exited by arrow keying out
        shapes[index] = "sampler";
    } else if (key === 'ArrowDown') {
        moveCursorDown()
    } else if (key === 'ArrowUp') {
        moveCursorUp()
    } else if (key === 'ArrowLeft') {
        moveCursorBack()
    } else if (key === 'ArrowRight') {
        advanceCursor()
    }
    // does this key match work for all computers / browsers? idk
    else if (key === "Backspace" || keyCode === 8) {
        if(shapes[index] != null) {
            shapes[index] = null;
        } else if (cursorX > 0 || cursorY > 0) {
            moveCursorBack();
            index = cursorY * cols + cursorX;
            shapes[index] = null;
        }        
    }
}

function keyReleased() {
    if (key === '1') {
        penHeld = false;

        if(shapes[(cursorY * cols + cursorX) - 1]== null){
            moveCursorBack()
        }
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
    } else if (cursorY > 0) {
        cursorY--;
        cursorX = cols - 1;
    }
}

function moveCursorUp() {
    if (cursorY > 0) {
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