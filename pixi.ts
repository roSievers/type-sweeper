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
        let nbhdOffsets: Array<[number, number]> = [
            [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]]
        for (let [x, y] of nbhdOffsets) {
            yield new GridPoint(this.x + x, this.y + y)
        }
    }
    * bigNbhd() {
        let bigNbhdOffsets: Array<[number, number]> = [
            [-1, -1], [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [0, 4],
            [1, 3], [2, 2], [2, 0], [2, -2], [1, -3], [0, -4], [-1, -3],
            [-2, -2], [-2, 0], [-2, 2], [-1, 3]]
        for (let [x, y] of bigNbhdOffsets) {
            yield new GridPoint(this.x + x, this.y + y)
        }
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
    get hiddenMineCount(): number {
        let count = 0
        for (var [_, cell] of this.content) {
            if (!cell.revealed && cell.mine) {
                count += 1
            }
        }
        return count
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
            if (cell.mine) {
                if (cell.hintType == "simple") {
                    let count: number = 0;
                    for (let neighbor of point.bigNbhd()) {
                        let nbhdCell = this.content.get(neighbor);
                        if (nbhdCell != undefined && nbhdCell.mine) {
                            count += 1;
                        }
                    }
                    cell.caption = count.toString();
                } else {
                    // This caption should never be displayed.
                    cell.caption = "Error!"
                }
            } else {
                if (cell.hintType === null) {
                    cell.caption = "?"
                } else if (cell.hintType == "simple") {
                    let count: number = 0;
                    for (let neighbor of point.nbhd()) {
                        let nbhdCell = this.content.get(neighbor);
                        if (nbhdCell != undefined && nbhdCell.mine) {
                            count += 1;
                        }
                    }
                    cell.caption = count.toString();
                } else if (cell.hintType == "typed") {
                    let count: number = 0;
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
    container: PIXI.Container
    caption: string // Precomputed caption
    text: PIXI.Text
    hex: PIXI.Graphics
    hovered: boolean = false
    hintEnabled: boolean = true
    // The overlay of mines which indicates the region they count.
    regionOverlay: PIXI.Graphics
    regionOverlayVisible: boolean = false
    // Link to the parent game to pass up events
    parentGame: Game
    constructor(public revealed: boolean, public mine: boolean,
        public hintType: null | "simple" | "typed") { }
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
    get textColor(): number {
        if (this.hintEnabled) {
            if (this.mine) {
                return 0xFFFFFF
            } else {
                return 0x000000
            }
        } else {
            if (this.mine) {
                return 0x5050FF
            } else {
                return 0xAAAAAA
            }
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
        if (this.mine) {
            return this.revealed && (this.hintType !== null)
        } else {
            return this.revealed
        }
    }
    makeContainer(parentGame: Game): [PIXI.Container, PIXI.Graphics] {
        this.parentGame = parentGame
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

        // Create region overlay
        this.regionOverlay = new PIXI.Graphics
        this.regionOverlay.beginFill(0xCCCCFF)
        this.regionOverlay.drawPolygon(makeRegionOverview())
        this.regionOverlay.alpha = 0.5

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
            if (this.interactionLevel == InteractionLevel.shadowHint && this.mine && this.hintType == "simple") {
                this.regionOverlayVisible = !this.regionOverlayVisible
                this.updateGraphicProperties()
            } else {
                this.tryRevealEmpty()
            }
        })
        this.container.on("rightclick", (event) => {
            if (this.interactionLevel == InteractionLevel.shadowHint) {
                if (this.hintEnabled) {
                    this.hintEnabled = false
                    this.regionOverlayVisible = false
                } else {
                    this.hintEnabled = true
                }
                this.updateGraphicProperties()
            } else {
                this.tryRevealMine()
            }
        })

        this.updateGraphicProperties()

        return [this.container, this.regionOverlay]
    }
    updateGraphicProperties(): void {
        if (!this.hovered) { this.hex.tint = this.baseColor }
        else { this.hex.tint = this.hoverColor }

        this.text.visible = this.captionVisible
        this.text.tint = this.textColor

        this.regionOverlay.visible = this.regionOverlayVisible

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
            this.parentGame.onMineReveal()
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

function makeRegionOverview(): PIXI.Polygon {
    let alpha = Math.sqrt(3) / 2;
    let points = [
        [0.5, 4.33], [1, 3.464], [2, 3.464], [2.5, 2.598], [3.5, 2.598],
        [4, 1.732], [3.5, 0.866], [4, 0], [3.5, -0.866], [4, -1.732],
        [3.5, -2.598], [2.5, -2.598], [2, -3.464], [1, -3.464], [0.5, -4.33],
        [- 0.5, -4.33], [-1, -3.464], [-2, -3.464], [-2.5, -2.598],
        [-3.5, -2.598], [-4, -1.732], [-3.5, -0.866], [-4, 0], [-3.5, 0.866],
        [-4, 1.732], [-3.5, 2.598], [-2.5, 2.598], [-2, 3.464], [-1, 3.464],
        [-0.5, 4.33]]
    return new PIXI.Polygon(points.map(([x, y]) => new PIXI.Point(x, y)))
}

// Parser bindings

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

function parseLevelFile(file: string): Array<ParsedLevel> {
    let levels = (<any>window).null.parse(file)
    return levels
}

interface LevelFile {
    content: string,
}

class Level {
    title: string
    author: string
    grid: Grid
    constructor(parsedLevel: ParsedLevel) {
        this.title = parsedLevel.title
        this.author = parsedLevel.author
        this.grid = new Grid(parsedLevel)
    }
}

class ContainerLayers {
    ui: PIXI.Container
    overlay: PIXI.Container
    grid: PIXI.Container
    credits: PIXI.Container
    constructor(parentContainer: PIXI.Container) {
        this.ui = new PIXI.Container()
        this.overlay = new PIXI.Container()
        this.grid = new PIXI.Container()
        this.credits = new PIXI.Container()
        parentContainer.addChild(this.credits)
        parentContainer.addChild(this.grid)
        parentContainer.addChild(this.overlay)
        parentContainer.addChild(this.ui)
    }
    clearLevel() {
        this.overlay.removeChildren()
        this.grid.removeChildren()
        this.credits.removeChildren()
    }
    applyFit([scale, offset]: [number, PIXI.Point]) {
        this.overlay.scale = new PIXI.Point(scale, scale)
        this.overlay.x = offset.x
        this.overlay.y = offset.y
        this.grid.scale = new PIXI.Point(scale, scale)
        this.grid.x = offset.x
        this.grid.y = offset.y
    }
}

class Game {
    app: PIXI.Application
    levels: Array<ParsedLevel>
    currentLevelIndex: number
    currentLevel: Level
    layers: ContainerLayers
    remainingMines: Counter
    fullscreenButton: FullscreenButton = new FullscreenButton()
    constructor(game_data: LevelFile) {
        this.app = new PIXI.Application(1000, 600, { backgroundColor: 0xffffff, antialias: true });
        setTimeout(() => {
            this.app.view.width = 1200
            this.app.view.height = 720
            this.onResize()
        }, 2000)

        this.layers = new ContainerLayers(this.app.stage)

        // Suppress the context menu
        this.app.view.addEventListener('contextmenu', (e) => { e.preventDefault(); });

        this.makeUi()

        // Load first level
        this.levels = parseLevelFile(game_data.content)
        this.currentLevelIndex = 0
        this.loadCurrentLevel()
    }
    loadCurrentLevel() {
        this.currentLevel = new Level(this.levels[this.currentLevelIndex])
        this.remainingMines.value = this.currentLevel.grid.hiddenMineCount

        this.onResize()

        this.layers.clearLevel()

        for (let [point, cell] of this.currentLevel.grid.content) {
            let [container, overlay] = cell.makeContainer(this)

            // Position the container at the correct game location
            // Instead of two layers, this could also use a zOrder trick.
            // https://github.com/pixijs/pixi.js/issues/3999
            container.position = point.pixel
            overlay.position = point.pixel

            this.layers.grid.addChild(container)
            this.layers.overlay.addChild(overlay)
        }
    }
    makeUi() {
        this.remainingMines = new Counter(40)
        this.remainingMines.container.x = 40 + 10
        this.remainingMines.container.y = 40 * Math.sqrt(3) / 2 + 10
        this.layers.ui.addChild(this.remainingMines.container)

        this.fullscreenButton.container.scale = new PIXI.Point(40, 40)
        this.fullscreenButton.container.x = 40 + 10
        this.fullscreenButton.container.y = 40 * Math.sqrt(3) + 40 + 2 * 10
        this.layers.ui.addChild(this.fullscreenButton.container)
    }
    onResize() {
        this.app.renderer.resize(this.app.view.width, this.app.view.height)

        this.layers.applyFit(
            this.currentLevel.grid.fitIntoFrame(this.app.renderer.width, this.app.renderer.height)
        )
    }
    onMineReveal() {
        this.remainingMines.value = this.remainingMines.value - 1
    }
}

class Counter {
    _value: number = 0
    caption: PIXI.Text
    container: PIXI.Container = new PIXI.Container()
    constructor(public size: number) {
        // Add a background hexagon to the container
        let hex = new PIXI.Graphics()
        hex.beginFill(0x0000FF)
        hex.drawPolygon(makeHexagon(size))
        this.container.addChild(hex)

        // Create text
        this.caption = new PIXI.Text(this._value.toString(), { fontFamily: 'Arial', fontSize: size, fill: 0xFFFFFF, align: 'center' })
        this.caption.anchor.x = 0.5
        this.caption.anchor.y = 0.5
        this.container.addChild(this.caption)
    }
    get value(): number {
        return this._value
    }
    set value(new_value: number) {
        this._value = new_value

        // Remove old caption
        this.caption.destroy()
        // Create new caption
        this.caption = new PIXI.Text(this._value.toString(), { fontFamily: 'Arial', fontSize: this.size, fill: 0xFFFFFF, align: 'center' })
        this.caption.anchor.x = 0.5
        this.caption.anchor.y = 0.5
        this.container.addChild(this.caption)
    }
}

class FullscreenButton {
    _fullscreen: boolean = false
    container: PIXI.Container = new PIXI.Container()
    requestFullscreenAction: PIXI.Graphics
    leaveFullscreenAction: PIXI.Graphics
    constructor() {
        console.log("constructed")
        let gap = 0.2
        let lineWidth = 0.1
        {
            let graphic = new PIXI.Graphics()
            graphic.lineStyle(lineWidth, 0xFFFFFF)
            graphic.moveTo(gap, 1)
                .lineTo(1, 1)
                .lineTo(1, gap)
            graphic.moveTo(1, -gap)
                .lineTo(1, -1)
                .lineTo(gap, -1)
            graphic.moveTo(-gap, -1)
                .lineTo(-1, -1)
                .lineTo(-1, -gap)
            graphic.moveTo(-1, gap)
                .lineTo(-1, 1)
                .lineTo(-gap, 1)
            this.container.addChild(graphic)
            this.requestFullscreenAction = graphic
        }
        {
            let graphic = new PIXI.Graphics()
            graphic.lineStyle(lineWidth, 0xFFFFFF)
            graphic.moveTo(gap, 1)
                .lineTo(gap, gap)
                .lineTo(1, gap)
            graphic.moveTo(1, -gap)
                .lineTo(gap, -gap)
                .lineTo(gap, -1)
            graphic.moveTo(-gap, -1)
                .lineTo(-gap, -gap)
                .lineTo(-1, -gap)
            graphic.moveTo(-1, gap)
                .lineTo(-gap, gap)
                .lineTo(-gap, 1)
            this.container.addChild(graphic)
            this.leaveFullscreenAction = graphic
        }
        this.container.interactive = true
        this.container.hitArea = new PIXI.Rectangle(-1, -1, 2, 2)
        this.fullscreenActive = this._fullscreen
        this.requestFullscreenAction.tint = 0xBBBBBB
        this.leaveFullscreenAction.tint = 0xBBBBBB

        this.container.on("mouseover", () => {
            this.requestFullscreenAction.tint = 0x808080
            this.leaveFullscreenAction.tint = 0x808080
        })
        this.container.on("mouseout", () => {
            this.requestFullscreenAction.tint = 0xBBBBBB
            this.leaveFullscreenAction.tint = 0xBBBBBB
        })
    }
    get fullscreenActive(): boolean {
        return this._fullscreen
    }
    set fullscreenActive(new_value: boolean) {
        this._fullscreen = new_value

        this.requestFullscreenAction.visible = !this._fullscreen
        this.leaveFullscreenAction.visible = this._fullscreen
    }
    on(event: string, handler: any): void {
        this.container.on(event, handler)
    }
}

// Game setup

let exampleLevelString = "Hexcells level v1\n\
Basic Example Level\n\
Rolf Sievers\n\
\n\
O+..On..\n\
..x...o.\n\
o+..x...\n\
..O+....\n\
....x...\n\
..x+...."

let game = new Game({ "content": exampleLevelString })

document.body.appendChild(game.app.view);