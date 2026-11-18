import OutOfOfficeUiRecord from "./outOfOfficeUiRecord.js";

export class OutOfOfficeUiManager {

    constructor(element, connector, manager) {
        this.element = element
        this.outOfOfficeManager = manager;
        this.connector = connector
        OutOfOfficeUiRecord.connector = connector;
    }

    render() {
        let outOfOffices = this.outOfOfficeManager.outOfOffices;

        let elements = []
        outOfOffices.map(abs => new OutOfOfficeUiRecord(abs)).forEach(abui => {
            try {
                elements.push(abui.getElement())
            } catch (e) {
                console.warn("Could not show out of office item", e, abui.outOfOffice)
            }
        })
        // in één keer plaatsen
        this.element.replaceChildren(...elements)
    }

    async refresh() {
        //TODO: this is quick n dirty way to show the new changes
        let changes = await this.outOfOfficeManager.loadAll()
        if (Object.keys(changes).length) {
            this.render()
        }
    }

}
