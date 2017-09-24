class GridPoint {
    constructor(public x: number, public y: number) { }
    static pt([x, y]: [number, number]) : GridPoint {
        return new GridPoint(x, y)
    }
    get pixel(): PIXI.Point {
        return new PIXI.Point(1.5 * this.x, 0.866 * this.y);
    }
    get tuple(): [number, number] {
        return [this.x, this.y];
    }
    // Iterates over all neighboring coordinates, starting to the top going clockwise.
    * nbhd () {
        yield new GridPoint(this.x, this.y-2);
        yield new GridPoint(this.x + 1, this.y -1);
        yield new GridPoint(this.x + 1, this.y +1);
        yield new GridPoint(this.x, this.y+2);
        yield new GridPoint(this.x - 1, this.y +1);
        yield new GridPoint(this.x - 1, this.y -1);        
    }
}

class Grid {
    content: Map<[number, number], Cell>;
    constructor() {
        this.content = new Map();
        this.content.set([2, 3], new Cell(false, false));
        this.content.set([2, 5], new Cell(true, true));
        this.content.set([3, 4], new Cell(true, false));
        this.content.set([4, 3], new Cell(true, false));
    }
    * iter() : IterableIterator<[GridPoint, Cell]>{
        for (var [pt, cell] of this.content) {
            yield [new GridPoint(pt[0], pt[1]), cell];
        }
    }
    makeBoundingPoints() : {x : BoundingInterval, y: BoundingInterval} {
        let x = new BoundingInterval();
        let y = new BoundingInterval();
        for (var [pt, cell] of this.content) {
            let pixel = new GridPoint(pt[0], pt[1]).pixel;
            x.add(pixel.x);
            y.add(pixel.y);
        }
        return {x, y};
    }
    // This calculates the transformation which fits the level into a
    // given frame.
    fitIntoFrame(width: number, height: number) : [number, PIXI.Point] {
        let bounds = this.makeBoundingPoints();
        let xPadding = 2;
        let yPadding = Math.sqrt(3);
        // scale factor
        let xScale = width / (bounds.x.length + xPadding);
        let yScale = height / (bounds.y.length + yPadding);
        let scale = Math.min(xScale, yScale);
        // offset
        let xOffset = width / 2 - bounds.x.center*scale;
        let yOffset = height / 2 - bounds.y.center*scale;

        return [scale, new PIXI.Point(xOffset, yOffset)];
    }
    // Precalculate all the captions and store them in the cells.
    makeCaptions() : void {
        // Right now I only support plain hints
        for (var [point, cell] of this.iter()) {
            console.log("Nbhd of:", point);
            for (let neighbor of point.nbhd()) {
                console.log(neighbor, this.content.get(neighbor.tuple));
            }
        }
    }
}

class BoundingInterval {
    public min : number = null;
    public max : number = null;
    constructor() {}
    add(value: number) {
        if (this.min == null || this.min > value) {
            this.min = value
        }
        if (this.max == null || this.max < value) {
            this.max = value
        }
    }
    get length() : number {
        return this.max - this.min;
    }
    get center() : number {
        return (this.min + this.max) / 2;
    }
}

class Cell {
    caption : string; // Precomputed caption
    constructor(public revealed: boolean, public mine: boolean) {}
    baseColor() : number {
        if (!this.revealed) {
            return 0xFFFF00
        } else {
            if (this.mine) {
                return 0x0000FF
            } else {
                return 0x555555
            }
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


// Setup for Pixi
let app = new PIXI.Application(1000, 600, { backgroundColor: 0xffffff, antialias : true });
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



for (let [point, cell] of myGrid.iter()) {
    let visibleHex = makeHexagon(0.9);
    let interactiveHex = makeHexagon();

    // Add the hexagon to the stage
    let graphics = new PIXI.Graphics();

    // visible part
    graphics.beginFill(cell.baseColor());
    graphics.drawPolygon(visibleHex);

    graphics.position = point.pixel;

    // interactive part
    graphics.hitArea = visibleHex;
    graphics.interactive = true;
    graphics.on("click", (event) => {
        console.log(graphics.children);
    });

    app.stage.addChild(graphics);
}