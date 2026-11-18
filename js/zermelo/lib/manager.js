import {countDroppedRows} from "../../diagnostics.js";

class Manager{
    session;
    // veld -> verwacht type; rijen zonder geldig verplicht veld worden weggelaten en geteld
    requiredFields = {};

    constructor(session){
        this.session = session
    }

    async get(options = {}, req_options = {}){
        let res = await this.session.request(this.endpoint, options, req_options)

        return this.#validRows(res, options).map(r => new this.interface(r))
    }

    #validRows(rows, options){
        let requested = options.fields
        let checks = Object.entries(this.requiredFields)
            // een veld dat niet opgevraagd is, kan ook niet ontbreken
            .filter(([field]) => requested === undefined || requested.includes(field))
        if(!checks.length){
            return rows
        }
        let valid = rows.filter(row => row && checks.every(([field, type]) => {
            let value = row[field]
            return type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type
        }))
        if(valid.length !== rows.length){
            console.warn(this.endpoint + ": skipped " + (rows.length - valid.length) + " row(s) with missing or invalid fields")
            countDroppedRows(this.endpoint, rows.length - valid.length)
        }
        return valid
    }
}

class ManagerWithId extends Manager{
    requiredFields = {id: "number"};

    async get(options = {}, req_options = {}){
        if(options.fields !== undefined && !options.fields.includes("id")){
            options.fields.push('id')
        }

        let res = await super.get(options, req_options)

        let res_holder = {}
        res.forEach(r => {
            res_holder[r.id] = r
        })
        return res_holder
    }
}

export { Manager, ManagerWithId };
