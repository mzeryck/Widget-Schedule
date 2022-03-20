// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;

// Do not modify the following comment.
// THIS_IS_SCHEDULE_WIDGET

class RowItem extends UITableRow {
  constructor(name) {
    super()
    this.name = name
    this.height = 55
    this.dismissOnSelect = false
    this.cellSpacing = 0
  
    this.onSelect = async () => {
      const newName = await promptForScript(this)
      if (this.defaultRow) schedule.defaultWidget = newName
      else await updateSchedule(newName, this.start, this.end, true)
      await loadTable()
    }
  }
}

class DefaultRow extends RowItem {
  constructor(name) {
    super(name)
    this.defaultRow = true
    const cell = this.addText(this.name, this.description())
    cell.subtitleColor = Color.gray()
    cell.widthWeight = 70
  }
  
  description() {
    return "Default"
  }
}

class TimedRow extends RowItem {
  constructor(name, start, end) {
    super(name)
    this.start = start
    this.end = end
    this.defaultRow = false
    
    const cell = this.addText(this.name, this.description())
    cell.subtitleColor = Color.gray()
    cell.widthWeight = 70
    
    const startButton = this.addButton("Start")
    const endButton = this.addButton("End")
    const delButton = this.addButton("\u274c")
    startButton.widthWeight = 15
    endButton.widthWeight = 15
    delButton.widthWeight = 10
  
    startButton.onTap = async () => {
      await changeStart(this, await pickTime(Schedule.indexToDate(this.start),null,Schedule.indexToDate(this.end)))
      await loadTable()
    }
  
    endButton.onTap = async () => {
      await changeEnd(this, await pickTime(Schedule.indexToDate(this.end + 1), Schedule.indexToDate(this.start + 1), Schedule.indexToDate(96)) - 1) // broken lol
      await loadTable()
    }
  
    delButton.onTap = async () => {
      if (!(await shouldPerformDestructive(`Are you sure you want to delete the ${this.description()} schedule for ${this.name}?`, "Delete"))) return
      await updateSchedule("", this.start, this.end, true)
      await loadTable()
    }
  }
  
  description() {
    return Schedule.indexToString(this.start) + "-" + Schedule.indexToString(this.end+1)
  }
}

class Schedule {

  constructor(defaultWidget, times) {
    this.defaultWidget = defaultWidget
    this.times = times || new Array(48).fill("")
  }
  
  async currentWidget(fm) {
    const directoryPath = fm.joinPath(fm.documentsDirectory(), "Schedule Widget")
    if (!fm.fileExists(directoryPath) || !fm.isDirectory(directoryPath)) fm.createDirectory(directoryPath)
    
    const name = this.times[Schedule.dateToIndex(new Date())] || this.defaultWidget
    const scriptPath = fm.joinPath(fm.documentsDirectory(), name + ".js")
    const exportPath = fm.joinPath(directoryPath, name)
    
    if (!fm.fileExists(exportPath) || fm.modificationDate(scriptPath) > fm.modificationDate(exportPath)) {  
      const scriptString = "module.exports = async function() {" + fm.readString(scriptPath) + "}"
      fm.writeString(exportPath, scriptString.replace(/Script.name\(\)/g,`"${name}"`))
    }

    const exportFunction = importModule(exportPath)
    await exportFunction()
  }
  
  static fromFile(fm, path) {
    if (!fm.fileExists(path)) return null
    const file = JSON.parse(fm.readString(path))
    return new Schedule(file.defaultWidget, file.times)
  }
  
  static toFile(schedule, fm, path) {
    fm.writeString(path, JSON.stringify(schedule))
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

let fm, path, widget, schedule, table

await launch()

async function launch() {
  fm = FileManager.local()
  fm = (fm.isFileStoredIniCloud(module.filename)) ? FileManager.iCloud() : fm
  path = fm.joinPath(fm.libraryDirectory(), Script.name() + "-schedule")
  
  if (!fm.fileExists(path)) {
    if (config.runsInApp) return await setup()
    widget = new ListWidget()
    widget.addText("This widget is not set up. Open the Scriptable app and run this script to set up your schedule.")
    return Script.setWidget(widget)
  }
  
  schedule = Schedule.fromFile(fm, path)
  if (config.runsInApp) return await edit()
  return await schedule.currentWidget(fm)
}

async function setup() {
  if (await generateAlert("Welcome to ScheduleWidget! Make sure your widget has the name you want before you begin.",['I like the name "' + Script.name() + '"', "Let me go change it"])) return
  
  const defaultWidget = await promptForText("Default Widget","Choose the widget that will display by default when no other widgets are scheduled.")
  if (!defaultWidget) return await generateAlert("You need to enter the name of a widget.")
  
  schedule = new Schedule(defaultWidget)
  return await edit()
}

async function edit() {
  table = new UITable()
  table.showSeparators = true
  await loadTable()
  await table.present()
}
  
async function loadTable() {
  Schedule.toFile(schedule, fm, path)
  table.removeAllRows()
  
  const headerRow = new UITableRow()
  headerRow.isHeader = true
  headerRow.height = 75
  
  const headline = headerRow.addText(Script.name(),"Widget Schedule")
  headline.widthWeight = 70
  
  const settingsButton = headerRow.addButton("Settings")
  settingsButton.widthWeight = 30
  settingsButton.rightAligned()
  
  settingsButton.onTap = async () => {
    const response = await generateAlert("Settings", ["Update code","Close settings"])
    if (response == 0) {
      
    }
  }
  
  table.addRow(headerRow)

  table.addRow(new DefaultRow(schedule.defaultWidget))

  let i, name, start
  for (i = 0; i <= schedule.times.length; i++) {
    const current = schedule.times[i]
    if (name == current) continue
    if (name) table.addRow(new TimedRow(name, start, i-1))
  
    name = current.length ? current : null
    start = current.length ? i : null
  }

  const addRow = new UITableRow()
  addRow.height = 55
  addRow.dismissOnSelect = false
  
  const addCell = addRow.addText("Add to Schedule")
  addCell.titleColor = Color.blue()
  addRow.onSelect = async () => {
    await addItem()
    await loadTable()
  }
  
  table.addRow(addRow)
  table.reload()
}

async function updateSchedule(name, start, end, suppressAlert) {
  if (!suppressAlert && schedule.times.slice(start, end).some(r => r.length && r != name)) {
    if (!(await shouldPerformDestructive("This will overwrite other parts of the schedule. Do you want to continue?", "Continue"))) return
  }
  for (i=start; i <= end; i++) {
    schedule.times[i] = name
  }
}

async function changeStart(item, newStart) {
  if (item.start == newStart) return
  if (newStart > item.start) return await updateSchedule("", item.start, newStart - 1)
  await updateSchedule(item.name, newStart, item.end)
}

async function changeEnd(item, newEnd) {
  if (item.end == newEnd) return
  if (newEnd < item.end) return await updateSchedule("", newEnd + 1, item.end)
  await updateSchedule(item.name, item.start, newEnd)
}

async function addItem() {
  const name = await promptForScript()
  if (!name || !name.length) return await generateAlert("No script was entered.")
  const start = await pickTime()
  const minEnd = Schedule.indexToDate(start+1)
  const end = await pickTime(minEnd, minEnd)
  await updateSchedule(name, start, end-1)
}

async function promptForScript(item) {

  const scripts = new UITable()
  scripts.showSeparators = true
  
  let resolve
  const promise = new Promise((thisResolve) => {
    resolve = thisResolve
  })
  
  for (filename of fm.listContents(fm.documentsDirectory())) {
    if (fm.fileExtension(filename) != 'js') continue
    
    const filePath = fm.joinPath(fm.documentsDirectory(), filename)
    if (fm.isFileStoredIniCloud(filePath)) await fm.downloadFileFromiCloud(filePath)
    const file = fm.readString(filePath)
    
    if (file.includes("// THIS_IS_SCHEDULE_WIDGET")) continue
    
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
  await scripts.present()
  return promise
}

async function promptForText(title, message, placeholder, text) {
  const alert = new Alert()
  alert.title = title
  alert.message = message
  alert.addTextField(placeholder,text)
  alert.addAction("OK")
  await alert.present()
  return alert.textFieldValue(0)
}

async function generateAlert(message, buttons=["OK"]) {
  const alert = new Alert()
  alert.message = message
  for (button of buttons) { alert.addAction(button) }
  return await alert.present()
}

async function shouldPerformDestructive(message, destructive) {
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
  
  const time = await picker.pickTime()
  return Schedule.dateToIndex(time)
}

async updateCode() {
  let message = "The update failed. Please try again later."
  try {
    const codeString = await new Request("https://raw.githubusercontent.com/mzeryck/Widget-Schedule/main/widget-schedule.js").loadString()
    if (codeString.includes("// Variables used by Scriptable.")) {
      fm.writeString(module.filename, codeString)
      message = "The code has been updated. If the script is open, close it for the change to take effect."
    }
  } catch { }
  await generateAlert(message)
}
