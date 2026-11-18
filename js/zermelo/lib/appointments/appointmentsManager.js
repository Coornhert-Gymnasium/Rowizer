import { Manager } from "../manager.js";
import AppointmentInterface from "./appointmentInterface.js";

class AppointmentsManager extends Manager{
    endpoint = "appointments";
    interface = AppointmentInterface;
    requiredFields = {id: "number", start: "number", end: "number"};
}

export default AppointmentsManager
