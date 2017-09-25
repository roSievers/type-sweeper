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
    constructor() {
        this.content = new GridMap();
        this.content.set(new GridPoint(2, 3), new Cell(false, false));
        this.content.set(new GridPoint(2, 5), new Cell(true, true));
        this.content.set(new GridPoint(3, 4), new Cell(true, false));
        this.content.set(new GridPoint(4, 3), new Cell(true, false));

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
            for (let neighbor of point.nbhd()) {
                let nbhdCell = this.content.get(neighbor);
                if (nbhdCell != undefined) {
                    if (nbhdCell.mine) {
                        count += 1;
                    }
                }
            }
            cell.caption = count.toString();
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

class Cell {
    caption: string; // Precomputed caption
    constructor(public revealed: boolean, public mine: boolean) { }
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
    get interactive(): boolean {
        if (!this.revealed) {
            return true
        } else {
            return false
        }
    }
    get captionVisible(): boolean {
        console.log("asked about revealed: ", this)
        return this.revealed
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


// Setup for Pixi
let app = new PIXI.Application(1000, 600, { backgroundColor: 0xffffff, antialias: true });
document.body.appendChild(app.view);

app.renderer.view.style.border = "1px dashed black";

// Actually rendering my app

let myGrid = new Grid();

// Zoom into the level.
let stage = app.stage;

let [scale, offset] = myGrid.fitIntoFrame(app.renderer.width, app.renderer.height);
stage.scale = new PIXI.Point(scale, scale);
stage.x = offset.x;
stage.y = offset.y;


for (let [point, cell] of myGrid.content) {
    let container = new PIXI.Container()

    // Add the hexagon to the container
    let hex = new PIXI.Graphics()
    container.addChild(hex)
    hex.beginFill(0xFFFFFF)
    hex.tint = cell.baseColor
    hex.drawPolygon(makeHexagon(0.9))

    // Add the text
    let virtualFontSize = 256
    let text = new PIXI.Text(cell.caption, { fontFamily: 'Arial', fontSize: virtualFontSize, fill: 0x000000, align: 'center' })
    text.anchor.x = 0.5
    text.anchor.y = 0.5
    text.scale = new PIXI.Point(1 / virtualFontSize, 1 / virtualFontSize)
    container.addChild(text)
    text.visible = cell.captionVisible


    // Position the container at the correct game location
    container.position = point.pixel
    app.stage.addChild(container)

    // interactive part
    // TODO: With disabling eyecandy, this is more complicated. Some objects should be
    // interactive but not show the button mode and have no hover effect.
    if (cell.interactive) {
        container.buttonMode = true
        container.hitArea = makeHexagon(1)
        container.interactive = true
        container.on("mouseover", (event) => {
            hex.tint = cell.hoverColor
        })
        container.on("mouseout", (event) => {
            hex.tint = cell.baseColor
        })
        // TODO: I think that revealing the one hidden tile would be a good thing now
        container.on("click", (event) => {
            console.log(event)
        })
    }

}