class GridMap {
    // https://stackoverflow.com/a/43593634
    // Written by Nitzan Tomer as an answer for ZackDeRose. Slightly modified.
    private map = new Map<string, Cell>();

    set(key: GridPoint, value: Cell): this {
        this.map.set(JSON.stringify(key), value);
        return this;
    }

    get(key: GridPoint): Cell | undefined {
        return this.map.get(JSON.stringify(key));
    }

    clear() {
        this.map.clear();
    }

    delete(key: GridPoint): boolean {
        return this.map.delete(JSON.stringify(key));
    }

    has(key: GridPoint): boolean {
        return this.map.has(JSON.stringify(key));
    }

    get size() {
        return this.map.size;
    }

    *[Symbol.iterator](): IterableIterator<[GridPoint, Cell]> {
        for (let [stringKey, value] of this.map) {
            let objectKey = JSON.parse(stringKey);
            yield [new GridPoint(objectKey.x, objectKey.y), value];
        }
    }
}

class GridPoint {
    constructor(public x: number, public y: number) { }
    get pixel(): PIXI.Point {
        return new PIXI.Point(1.5 * this.x, 0.866 * this.y);
    }
    // Iterates over all neighboring coordinates, starting to the top going clockwise.
    * nbhd() {
        yield new GridPoint(this.x, this.y - 2);
        yield new GridPoint(this.x + 1, this.y - 1);
        yield new GridPoint(this.x + 1, this.y + 1);
        yield new GridPoint(this.x, this.y + 2);
        yield new GridPoint(this.x - 1, this.y + 1);
        yield new GridPoint(this.x - 1, this.y - 1);
    }
}

class Grid {
    content: GridMap;
    constructor(levelData: ParsedLevel) {
        this.content = new GridMap();

        levelData.grid.forEach((row, i) => {
            row.forEach((cell, j) => {
                if (cell != null) {
                    this.content.set(new GridPoint(j, i), new Cell(cell.revealed, cell.mine, cell.hint))
                }
            })
        })

        this.makeCaptions();
    }
    makeBoundingPoints(): { x: BoundingInterval, y: BoundingInterval } {
        let x = new BoundingInterval();
        let y = new BoundingInterval();
        for (var [point, cell] of this.content) {
            x.add(point.pixel.x);
            y.add(point.pixel.y);
        }
        return { x, y };
    }
    // This calculates the transformation which fits the level into a
    // given frame.
    fitIntoFrame(width: number, height: number): [number, PIXI.Point] {
        let bounds = this.makeBoundingPoints();
        let xPadding = 2;
        let yPadding = Math.sqrt(3);
        // scale factor
        let xScale = width / (bounds.x.length + xPadding);
        let yScale = height / (bounds.y.length + yPadding);
        let scale = Math.min(xScale, yScale);
        // offset
        let xOffset = width / 2 - bounds.x.center * scale;
        let yOffset = height / 2 - bounds.y.center * scale;

        return [scale, new PIXI.Point(xOffset, yOffset)];
    }
    // Precalculate all the captions and store them in the cells.
    makeCaptions(): void {
        // Right now I only support plain hints
        for (var [point, cell] of this.content) {
            let count: number = 0;
            if (cell.hintType === null) {
                cell.caption = "?"
            } else if (cell.hintType == "simple") {
                for (let neighbor of point.nbhd()) {
                    let nbhdCell = this.content.get(neighbor);
                    if (nbhdCell != undefined && nbhdCell.mine) {
                        count += 1;
                    }
                }
                cell.caption = count.toString();
            } else if (cell.hintType == "typed") {
                // This counts how often two mines / empty spaces are adjacent to each other
                let adjacentPairCounter = 0
                let lastWasMine = null
                for (let neighbor of point.nbhd()) {
                    let nbhdCell = this.content.get(neighbor);
                    let thisIsMine
                    if (nbhdCell != undefined && nbhdCell.mine) {
                        count += 1;
                        thisIsMine = true
                    } else { thisIsMine = false }
                    
                    console.log(lastWasMine, thisIsMine)
                    if (thisIsMine == lastWasMine) { adjacentPairCounter += 1 }
                    lastWasMine = thisIsMine
                }
                // If the first and last cell match, then we didn't detect this.
                // If all mines are connected, then there are 4 or 6 matches of which we detect at least 3.
                // If there are two groups of mines, there are are at most 2 matches.
                if (adjacentPairCounter >= 3) {
                    cell.caption = "{" + count.toString() + "}"
                } else {
                    cell.caption = "-" + count.toString() + "-"
                }
            }
        }
    }
}


class BoundingInterval {
    public min: number = null;
    public max: number = null;
    constructor() { }
    add(value: number) {
        if (this.min == null || this.min > value) {
            this.min = value
        }
        if (this.max == null || this.max < value) {
            this.max = value
        }
    }
    get length(): number {
        return this.max - this.min;
    }
    get center(): number {
        return (this.min + this.max) / 2;
    }
}

enum InteractionLevel {
    buttonMode,
    shadowHint,
    noInteraction
}

class Cell {
    caption: string; // Precomputed caption
    container: PIXI.Container
    hex: PIXI.Graphics
    hintEnabled: boolean = true
    text: PIXI.Text
    hovered: boolean = false
    constructor(public revealed: boolean, public mine: boolean, public hintType: null | "simple" | "typed") { }
    get baseColor(): number {
        if (!this.revealed) {
            return 0xEEAA00
        } else {
            if (this.mine) {
                return 0x0000FF
            } else {
                return 0xcccccc
            }
        }
    }
    get hoverColor(): number {
        if (!this.revealed) {
            return 0xEEAAAA
        } else {
            return this.baseColor
        }
    }
    get interactionLevel(): InteractionLevel {
        if (!this.revealed) {
            return InteractionLevel.buttonMode
        } else if (this.captionVisible) {
            return InteractionLevel.shadowHint
        } else {
            return InteractionLevel.noInteraction
        }
    }
    get captionVisible(): boolean {
        return this.revealed && !this.mine
    }
    makeContainer(): PIXI.Container {
        // Creates the PIXI container and all the contained objects.
        // The objects are creates such that all visual changes can be
        // applied by only changing properties.
        if (this.container != undefined) {
            console.error("The cell's container should only be initialized once!")
        }
        this.container = new PIXI.Container()


        // Add the hexagon to the container
        this.hex = new PIXI.Graphics()
        this.hex.beginFill(0xFFFFFF)
        this.hex.drawPolygon(makeHexagon(0.9))
        this.container.addChild(this.hex)


        // Add the text
        let virtualFontSize = 256
        this.text = new PIXI.Text(this.caption, { fontFamily: 'Arial', fontSize: virtualFontSize, fill: 0xFFFFFF, align: 'center' })
        this.text.anchor.x = 0.5
        this.text.anchor.y = 0.5
        this.text.scale = new PIXI.Point(1 / virtualFontSize, 1 / virtualFontSize)
        this.container.addChild(this.text)


        // Hook in event handlers
        this.container.hitArea = makeHexagon(1)
        this.container.on("mouseover", (event) => {
            this.hovered = true
            this.updateGraphicProperties()
        })
        this.container.on("mouseout", (event) => {
            this.hovered = false
            this.updateGraphicProperties()
        })
        this.container.on("click", (event) => {
            this.tryRevealEmpty()
        })
        this.container.on("rightclick", (event) => {
            if (this.interactionLevel == InteractionLevel.shadowHint) {
                this.hintEnabled = !this.hintEnabled
                this.updateGraphicProperties()
            } else {
                this.tryRevealMine()
            }
        })

        this.updateGraphicProperties()

        return this.container
    }
    updateGraphicProperties(): void {
        if (!this.hovered) { this.hex.tint = this.baseColor }
        else { this.hex.tint = this.hoverColor }

        if (this.hintEnabled) { this.text.tint = 0x000000 }
        else { this.text.tint = 0xAAAAAA }


        this.text.visible = this.captionVisible

        switch (this.interactionLevel) {
            case InteractionLevel.buttonMode:
                this.container.interactive = true
                this.container.buttonMode = true
                break;
            case InteractionLevel.shadowHint:
                this.container.interactive = true
                this.container.buttonMode = false
                break;
            case InteractionLevel.noInteraction:
                this.container.interactive = false
                break;
        }
    }
    tryRevealEmpty(): void {
        if (this.revealed) { console.error("Tried to reval an already revealed hex.") }
        if (!this.mine) {
            this.revealed = true
            this.updateGraphicProperties()
        } else {
            // TODO: inform some object about the player error.
        }
    }
    tryRevealMine(): void {
        if (this.revealed) { console.error("Tried to reval an already revealed hex.") }
        if (this.mine) {
            this.revealed = true
            this.updateGraphicProperties()
            // TODO: inform global counter
        } else {
            // TODO: inform some object about the player error.
        }
    }
}

function makeHexagon(radius: number = 1): PIXI.Polygon {
    let alpha = Math.sqrt(3) / 2;
    return new PIXI.Polygon([
        new PIXI.Point(radius, 0),
        new PIXI.Point(radius * 0.5, alpha * radius),
        new PIXI.Point(radius * -0.5, alpha * radius),
        new PIXI.Point(- radius, 0),
        new PIXI.Point(radius * -0.5, -alpha * radius),
        new PIXI.Point(radius * 0.5, -alpha * radius)
    ]);
}


interface ParsedLevel {
    title: string,
    author: string,
    grid: Array<Array<null | ParsedCell>>
}

interface ParsedCell {
    hint: null | "simple" | "typed",
    mine: boolean,
    revealed: boolean
}

// TODO: Use the parser I just wrote
function parseLevelFile(file: string): Array<ParsedLevel> {
    let levels = (<any>window).null.parse(file)
    return levels
}

let exampleLevelString = "Hexcells level v1\n\
Basic Example Level\n\
Rolf Sievers\n\
\n\
O+..On..\n\
..x...o.\n\
o+..x...\n\
..O+....\n\
....x..."

let exampleLevel = parseLevelFile(exampleLevelString)[0]
let myGrid = new Grid(exampleLevel);


// Setup for Pixi
let app = new PIXI.Application(1000, 600, { backgroundColor: 0xffffff, antialias: true });
document.body.appendChild(app.view);

// Suppress the context menu
app.view.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

app.renderer.view.style.border = "1px dashed black";

// Actually rendering my app


// Zoom into the level.
let stage = app.stage;

let [scale, offset] = myGrid.fitIntoFrame(app.renderer.width, app.renderer.height);
stage.scale = new PIXI.Point(scale, scale);
stage.x = offset.x;
stage.y = offset.y;

for (let [point, cell] of myGrid.content) {
    let container = cell.makeContainer()

    // Position the container at the correct game location
    container.position = point.pixel
    app.stage.addChild(container)
}

