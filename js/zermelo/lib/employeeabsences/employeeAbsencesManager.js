import { ManagerWithId} from "../manager.js";
import EmployeeAbsenceInterface from "./employeeAbsenceInterface.js";

class EmployeeAbsencesManager extends ManagerWithId{
    endpoint = "employeeabsences";
    interface = EmployeeAbsenceInterface;
    requiredFields = {id: "number", start: "number", end: "number"};
}

export default EmployeeAbsencesManager
