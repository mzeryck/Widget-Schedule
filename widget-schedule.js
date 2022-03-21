// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: clock;

// Do not modify the following comment.
// THIS_IS_WIDGET_SCHEDULE

class Schedule {
  constructor(name, defaultWidget, times) {
    this.name = name
    this.defaultWidget = defaultWidget
    this.times = times || new Array(48).fill("")
  }
  
  async currentWidget() {
    const folderPath = Schedule.folderPath()
    if (!fm.fileExists(folderPath) || !fm.isDirectory(folderPath)) fm.createDirectory(folderPath)
    
    const name = this.times[Schedule.dateToIndex(new Date())] || this.defaultWidget
    const scriptPath = fm.joinPath(fm.documentsDirectory(), name + ".js")
    const exportPath = fm.joinPath(folderPath, name + ".widget")
    
    if (!fm.fileExists(exportPath) || fm.modificationDate(scriptPath) > fm.modificationDate(exportPath)) {
      await iCloudCheck(scriptPath)
      const scriptString = "module.exports = async function() {" + fm.readString(scriptPath) + "}"
      fm.writeString(exportPath, scriptString.replace(/Script.name\(\)/g,`"${name}"`))
    }

    const exportFunction = importModule(exportPath)
    await exportFunction()
  }
  
  save() {
    fm.writeString(Schedule.path(this.name), JSON.stringify(this))
  }
  
  updateDefault(newDefault) {
    this.defaultWidget = newDefault
    this.save()
  }
  
  async update(name, start, end, suppressAlert) {
    if (!suppressAlert && this.times.slice(start, end).some(r => r.length && r != name)) {
      if (!(await showDestructive("This will overwrite other parts of the schedule. Do you want to continue?", "Continue"))) return false
    }
    for (let i=start; i <= end; i++) {
      this.times[i] = name
    }
    this.save()
    return true
  }
  
  static path(name) {
    return fm.joinPath(Schedule.folderPath(), name + ".schedule")
  }
  
  static folderPath() {
    return fm.joinPath(fm.documentsDirectory(), "Widget Schedule")
  }
  
  static async load(name) {
    const path = Schedule.path(name)
    if (!fm.fileExists(path)) return null
    await iCloudCheck(path)
    const file = JSON.parse(fm.readString(path))
    return new Schedule(name, file.defaultWidget, file.times)
  }
  
  static indexToString(index) {
    const df = new DateFormatter()
    df.useShortTimeStyle()
    return df.string(Schedule.indexToDate(index))
  }
  
  static indexToDate(index) {
    if (isNaN(index)) return null
    const date = new Date()
    date.setHours(Math.floor(index/2))
    date.setMinutes(index % 2 == 0 ? 0 : 30)
    return date
  }
  
  static dateToIndex(date) {
    return (date.getHours() * 2) + (Math.floor(date.getMinutes() / 30))
  }
}

class ScheduleTable extends UITable {
  constructor(schedule) {
    super()
    this.schedule = schedule
    this.showSeparators = true
  }
  
  async update() {
    this.removeAllRows()
  
    const headerRow = new UITableRow()
    headerRow.isHeader = true
    headerRow.height = 75
  
    const headline = headerRow.addText(this.schedule.name,"Widget Schedule")
    headline.widthWeight = 70
  
    const settingsButton = headerRow.addButton("Settings")
    settingsButton.widthWeight = 30
    settingsButton.rightAligned()
  
    settingsButton.onTap = async () => {
      const response = await showAlert("Settings", ["Update code","Close settings"])
      if (response == 0) {
        await updateCode()
      }
    }
  
    this.addRow(headerRow)
    this.addRow(new DefaultRow(this.schedule.defaultWidget, this))

    let i, name, start
    for (i = 0; i <= this.schedule.times.length; i++) {
      const current = this.schedule.times[i]
      if (name == current) continue
      if (name) this.addRow(new TimedRow(name, this, start, i-1))
  
      name = current.length ? current : null
      start = current.length ? i : null
    }

    const addRow = new UITableRow()
    addRow.height = 55
    addRow.dismissOnSelect = false
  
    const addCell = addRow.addText("Add to Schedule")
    addCell.titleColor = Color.blue()
    addRow.onSelect = async () => {
      this.addItem()
    }
    this.addRow(addRow)
    
    this.reload()
  }
  
  async changeScript(item) {
    const newName = await pickScript()
    if (!newName) return
    if (item.defaultRow) this.schedule.updateDefault(newName)
    else await this.schedule.update(newName, item.start, item.end, true)
    this.update()
  }
  
  async changeStart(item) {
    let newStart = await pickTime(Schedule.indexToDate(item.start),null,Schedule.indexToDate(item.end))
    if (!newStart) return
    
    newStart = Schedule.dateToIndex(newStart)
    if (item.start == newStart) return
    
    if (newStart < item.start) await this.schedule.update(item.name, newStart, item.end)
    else await this.schedule.update("", item.start, newStart - 1, true)
    this.update()
  }

  async changeEnd(item) {
    let newEnd = await pickTime(Schedule.indexToDate(item.end + 1), Schedule.indexToDate(item.start + 1), Schedule.indexToDate(96))
    if (!newEnd) return
    
    newEnd = Schedule.dateToIndex(newEnd) - 1
    if (item.end == newEnd) return
    
    if (newEnd > item.end) await this.schedule.update(item.name, item.start, newEnd)
    else await this.schedule.update("", newEnd + 1, item.end, true)
    this.update()
  }
  
  async removeItem(item) {
    if (!(await showDestructive(`Are you sure you want to delete the ${item.description()} schedule for ${item.name}?`, "Delete"))) return
    await this.schedule.update("", item.start, item.end, true)
    this.update()
  }

  async addItem() {
    const name = await pickScript()
    if (!name) return await showAlert("No script was entered.")
    
    let start = await pickTime()
    if (!start) return await showAlert("No start time was entered.")
    start = Schedule.dateToIndex(start)
    
    const minEnd = Schedule.indexToDate(start+1)
    let end = await pickTime(minEnd, minEnd)
    if (!end) return await showAlert("No end time was entered.")
    end = Schedule.dateToIndex(end) - 1
    
    await this.schedule.update(name, start, end)
    this.update()
  }
}

class RowItem extends UITableRow {
  constructor(name, table) {
    super()
    this.name = name
    this.table = table
    
    this.height = 55
    this.dismissOnSelect = false
    this.cellSpacing = 0
  
    this.onSelect = async () => {
      this.table.changeScript(this)
    }
  }
  
  static textCell(item) {
    const cell = item.addText(item.name, item.description())
    cell.subtitleColor = Color.gray()
    cell.widthWeight = 70
    return cell
  }
}

class DefaultRow extends RowItem {
  constructor(name, table) {
    super(name, table)
    this.defaultRow = true
    RowItem.textCell(this)
  }
  
  description() {
    return "Default"
  }
}

class TimedRow extends RowItem {
  constructor(name, table, start, end) {
    super(name, table)
    this.defaultRow = false
    this.start = start
    this.end = end
    RowItem.textCell(this)
    
    const startButton = this.addButton("Start")
    const endButton = this.addButton("End")
    const delButton = this.addButton("\u274c")
    startButton.widthWeight = 15
    endButton.widthWeight = 15
    delButton.widthWeight = 10
  
    startButton.onTap = async () => {
      this.table.changeStart(this)
    }
  
    endButton.onTap = async () => {
      this.table.changeEnd(this)
    }
  
    delButton.onTap = async () => {
      this.table.removeItem(this)
    }
  }
  
  description() {
    return Schedule.indexToString(this.start) + "-" + Schedule.indexToString(this.end+1)
  }
}

/* 
 * Launch
 * -------------------------------------------- */

let fm
await launch()

async function launch() {
  fm = FileManager.local()
  fm = (fm.isFileStoredIniCloud(module.filename)) ? FileManager.iCloud() : fm
  const schedule = await Schedule.load(Script.name())
  
  if (!schedule) {
    if (config.runsInApp) return await setup()
    const widget = new ListWidget()
    widget.addText("This widget is not set up. Open the Scriptable app and run this script to set up your schedule.")
    return Script.setWidget(widget)
  }
  
  if (config.runsInApp) return await edit(schedule)
  return await schedule.currentWidget()
}

async function setup() {
  if (await showAlert("Welcome to Widget Schedule! Make sure your widget has the name you want before you begin.",['I like the name "' + Script.name() + '"', "Let me go change it"])) return
  
  await showAlert("On the next screen, choose the widget that will display by default when no other widgets are scheduled.")
  const defaultWidget = await pickScript()
  if (!defaultWidget) return await showAlert("You need to select a default widget.")
  
  const folderPath = Schedule.folderPath()
  if (!fm.fileExists(folderPath) || !fm.isDirectory(folderPath)) fm.createDirectory(folderPath)
  
  const schedule = new Schedule(Script.name(), defaultWidget)
  schedule.save()
  return await edit(schedule)
}

async function edit(schedule) {
  const table = new ScheduleTable(schedule)
  await table.update()
  await table.present()
}

/* 
 * Helpers
 * -------------------------------------------- */

async function showAlert(message, buttons=["OK"]) {
  const alert = new Alert()
  alert.message = message
  for (button of buttons) { alert.addAction(button) }
  return await alert.present()
}

async function showDestructive(message, destructive) {
  const alert = new Alert()
  alert.message = message
  alert.addAction("Cancel")
  alert.addDestructiveAction(destructive)
  return await alert.present()
}

async function pickTime(initial, min, max) { 
  const picker = new DatePicker()
  picker.minuteInterval = 30

  if (initial) picker.initialDate = initial
  if (min) picker.minimumDate = min
  if (max) picker.maximumDate = max
  
  return await picker.pickTime()
}

async function pickScript() {
  const scripts = new UITable()
  scripts.showSeparators = true
  
  let resolve
  const promise = new Promise((thisResolve) => {
    resolve = thisResolve
  })
  
  for (filename of fm.listContents(fm.documentsDirectory())) {
    if (fm.fileExtension(filename) != 'js') continue
    
    const filePath = fm.joinPath(fm.documentsDirectory(), filename)
    await iCloudCheck(filePath)
    const file = fm.readString(filePath)
    
    if (file.includes("// THIS_IS_WIDGET_SCHEDULE")) continue
    
    const row = new UITableRow()
    row.height = 55
    
    const match = file.match(/\/\/ icon-color: (.+?); icon-glyph: (.+?);/)
    const symbol = row.addText("\u25a0")
    symbol.titleColor = Color.blue()
    symbol.widthWeight = 1
    
    const name = fm.fileName(filePath)
    const text = row.addText(name) 
    text.widthWeight = 25
    
    row.onSelect = () => {
      resolve(name)
    }
    
    scripts.addRow(row)
  }
  
  resolve((await scripts.present()).length)
  return promise
}

async function updateCode() {
  let message = "The update failed. Please try again later."
  try {
    const codeString = await new Request("https://raw.githubusercontent.com/mzeryck/Widget-Schedule/main/widget-schedule.js").loadString()
    if (codeString.includes("// Variables used by Scriptable.")) {
      fm.writeString(module.filename, codeString)
      message = "The code has been updated. If the script is open, close it for the change to take effect."
    }
  } catch { }
  await showAlert(message)
}

async function iCloudCheck(path) {
  if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path)
}