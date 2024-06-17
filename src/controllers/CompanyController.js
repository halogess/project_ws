const Joi = require("joi").extend(require("@joi/date"));
const moment = require("moment");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
const crypto = require("crypto");
const { default: axios } = require("axios");
require("dotenv").config();

function formateddate() {
  let date = new Date();
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const viewEmployeePicture = async (req, res) => {
  const { username } = req.params;

  await client.connect();
  const collection = client.db("proyek_ws").collection("users");

  let employee = await collection.findOne({ username, role: "employee" });
  if (!employee) {
    return res.status(404).json({
      message: "Employee not found",
    });
  }

  if (employee.company != req.body.user.username) {
    return res.status(403).json({
      message: "This employee is not associated with this company",
    });
  }

  return res.status(200).sendFile(employee.profile_picture, { root: "." });
};

const getEmployeesSchema = Joi.object({
  name: Joi.string().optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
});

const getEmployees = async (req, res) => {
  const { name, offset } = req.query;
  let { limit } = req.query;
  const { user } = req.body;
  const { error } = getEmployeesSchema.validate({ name, limit, offset });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    let employeeDetails;
    const mainUser = await database
      .collection("users")
      .findOne({ username: user.username });

    if (!mainUser) {
      return res.status(404).send({ message: "Company not found" });
    }

    const employeeUsernames = mainUser.employees;

    const nameQuery = req.query.name || "";
    const nameRegex = new RegExp(nameQuery, "i");

    employeeDetails = await database
      .collection("users")
      .find(
        {
          username: { $in: employeeUsernames },
          name: { $regex: nameRegex },
        },
        { projection: { username: 1, email: 1, name: 1, _id: 0 } }
      )
      .toArray();

    if (limit && offset) {
      employeeDetails = employeeDetails.slice(
        limit * (offset - 1),
        limit * offset
      );
    } else if (limit) {
      employeeDetails = employeeDetails.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      employeeDetails = employeeDetails.slice(0, limit);
    }

    const totalEmployees = mainUser.employees.length;
    const response = {
      total_employees: totalEmployees,
      total_employees_filtered: employeeDetails.length,
      employees_filtered: employeeDetails,
    };

    return res.status(200).send(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const employeeSchema = Joi.object({
  username: Joi.string().min(1).required(),
});

const getEmployeesByUsername = async (req, res) => {
  const { user } = req.body;
  const { username } = req.params;
  const { error, value } = employeeSchema.validate({ username });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    let employeeDetail;
    const mainUser = await database
      .collection("users")
      .aggregate([
        {
          $match: {
            username: user.username,
            employees: {
              $in: [username],
            },
          },
        },
      ])
      .toArray();

    if (mainUser.length == 0) {
      return res.status(404).send({ message: "Employee not found" });
    }

    employeeDetail = await database.collection("users").findOne(
      {
        username: username,
      },
      {
        projection: {
          _id: 0,
          username: 1,
          name: 1,
          email: 1,
          phone_number: 1,
          address: 1,
        },
      }
    );
    return res.status(200).send(employeeDetail);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const removeEmployeesFromCompany = async (req, res) => {
  const { user } = req.body;
  const { username } = req.params;
  const { error, value } = employeeSchema.validate({ username });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const mainUser = await database
      .collection("users")
      .aggregate([
        {
          $match: {
            username: user.username,
            employees: {
              $in: [username],
            },
          },
        },
      ])
      .toArray();

    if (mainUser.length == 0) {
      return res.status(404).send({ message: "Employee not found" });
    }

    const result = await database.collection("users").updateOne(
      { username: user.username },
      {
        $pull: {
          employees: username,
        },
      }
    );

    await database
      .collection("users")
      .updateOne({ username: username }, { $set: { company: "" } });

    if (result) {
      return res.status(200).send({
        message: `Successfully remove employee ${username} from company ${user.username}`,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const endOfYear = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31);
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const scheduleSchema = Joi.object({
  start_date: Joi.date()
    .iso()
    .min(formatDate(addDays(new Date(), 1)))
    .max(formatDate(endOfYear()))
    .required()
    .messages({
      "date.min": `start_date must be greater than or equal to ${formatDate(
        addDays(new Date(), 1)
      )}`,
      "date.max": `start_date must be less than or equal to ${formatDate(
        endOfYear()
      )}`,
      "date.base": `start_date must be a valid date`,
      "date.format": `start_date must be in the format YYYY-MM-DD`,
    }),
  end_date: Joi.date()
    .iso()
    .min(Joi.ref("start_date"))
    .max(formatDate(endOfYear()))
    .required()
    .messages({
      "date.min": `end_date must be greater than or equal to start_date`,
      "date.max": `end_date must be less than or equal to ${formatDate(
        endOfYear()
      )}`,
      "date.base": `start_date must be a valid date`,
      "date.format": `start_date must be in the format YYYY-MM-DD`,
    }),
});

const createSchedule = async (req, res) => {
  const { start_date, end_date } = req.body;
  const username = req.body.user.username;

  const { error } = scheduleSchema.validate({ start_date, end_date });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("schedules");

    const response = await axios.get("https://dayoffapi.vercel.app/api", {
      params: { year: moment(start_date).year() },
    });
    const holidays = response.data;

    const holidayDates = holidays.map((holiday) => ({
      date: moment(holiday.tanggal, "YYYY-M-D").format("YYYY-MM-DD"),
      detail: holiday.keterangan,
      is_cuti: holiday.is_cuti,
    }));

    const startDate = moment(start_date);
    const endDate = moment(end_date);
    let activeDays = 0;
    let offDays = [];
    let existingDays = [];

    const existingSchedules = await collection
      .find({
        username,
        date: { $gte: start_date, $lte: end_date },
      })
      .toArray();

    const existingDates = existingSchedules.map((schedule) => schedule.date);

    for (
      let date = startDate.clone();
      date.isSameOrBefore(endDate);
      date.add(1, "days")
    ) {
      const day = date.format("dddd");
      const dateString = date.format("YYYY-MM-DD");

      const isWeekend = day === "Saturday" || day === "Sunday";
      const holiday = holidayDates.find((h) => h.date === dateString);
      const isAlreadyScheduled = existingDates.includes(dateString);

      if (!isWeekend && !holiday && !isAlreadyScheduled) {
        activeDays++;
      } else {
        if (isWeekend || holiday) {
          offDays.push({
            day,
            date: dateString,
            detail: holiday ? holiday.detail : "",
          });
        }
        if (isAlreadyScheduled) {
          existingDays.push(dateString);
        }
      }
    }

    if (activeDays === 0) {
      return res.status(400).json({
        message:
          "No schedules were created as all dates are either holidays, weekends, or already scheduled",
      });
    }

    let charge = activeDays * 0.1;

    const companyCollection = database.collection("users");
    const company = await companyCollection.findOne({ username });

    if (company.balance < charge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    let oldBalance = parseFloat(company.balance);
    let newBalance = oldBalance - charge;
    newBalance = parseFloat(newBalance.toFixed(2));

    await companyCollection.updateOne(
      { username },
      { $set: { balance: newBalance } }
    );

    let success_date = [];

    for (
      let date = startDate.clone();
      date.isSameOrBefore(endDate);
      date.add(1, "days")
    ) {
      const day = date.format("dddd");
      const dateString = date.format("YYYY-MM-DD");

      const isWeekend = day === "Saturday" || day === "Sunday";
      const holiday = holidayDates.find((h) => h.date === dateString);
      const isAlreadyScheduled = existingDates.includes(dateString);

      if (!isWeekend && !holiday && !isAlreadyScheduled) {
        await collection.insertOne({
          username,
          date: dateString,
          day,
          attendance: [],
        });

        success_date.push(dateString);
      }
    }

    const transCollection = database.collection("transactions");

    charge = parseFloat(charge.toFixed(2));
    let insertTrans = await transCollection.insertOne({
      username: username,
      type: "Create schedules",
      date: formateddate(),
      start_date: start_date,
      end_date: end_date,
      charge: charge,
      number_of_schedules: activeDays,
      schedules: success_date,
    });

    if (insertTrans.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to save transaction" });
    }

    return res.status(201).json({
      message: "Schedule created successfully",
      charge: `$${charge.toFixed(2)}`,
      number_of_active_day: `${activeDays} days`,
      active_days: success_date,
      off_days: offDays,
      existing_days: existingDays,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const validateDate = (value, helpers) => {
  const { day, month, year } = helpers.state.ancestors[0];
  if (day && month && year) {
    const date = new Date(year, month - 1, day);
    if (date.getDate() !== day) {
      return helpers.error("any.invalid");
    }
  }
  return value;
};

const getScheduleSchema = Joi.object({
  start_date: Joi.date().iso().optional().messages({
    "date.base": `start_date must be a valid date`,
    "date.format": `start_date must be in the format YYYY-MM-DD`,
  }),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional().messages({
    "date.base": `end_date must be a valid date`,
    "date.format": `end_date must be in the format YYYY-MM-DD`,
    "date.min": `end_date must be greater than or equal to start_date`,
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
}).custom((value, helpers) => {
  if (
    (value.start_date && !value.end_date) ||
    (!value.start_date && value.end_date)
  ) {
    return helpers.message(
      "Both start_date and end_date must be provided together, or neither"
    );
  }
  return value;
});

const getSchedule = async (req, res) => {
  const { start_date, end_date, limit, offset } = req.query;

  const user = req.body.user;
  const username = user.role == "company" ? user.username : user.company;

  const { error } = getScheduleSchema.validate({
    start_date,
    end_date,
    limit,
    offset,
  });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const scheduleCollection = database.collection("schedules");
    const userCollection = database.collection("users");

    const employee = await userCollection.findOne({ username });
    if (user.role == "employee" && employee.company == "") {
      return res
        .status(400)
        .json({ message: "You are not associated with any company" });
    }

    let query = { username };
    if (start_date && end_date) {
      query.date = { $gte: start_date, $lte: end_date };
    }

    let schedules = await scheduleCollection
      .find(query)
      .sort({ date: 1 })
      .project({ _id: 0, username: 0 })
      .toArray();

    if (limit && offset) {
      companies = companies.slice(limit * (offset - 1), limit * offset);
    } else if (limit) {
      companies = companies.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      companies = companies.slice(0, limit);
    }

    const company = await userCollection.findOne({ username });
    const employeeUsernames = company.employees || [];
    const employeeDetails = await userCollection
      .find({ username: { $in: employeeUsernames } })
      .toArray();

    if (user.role == "company") {
      schedules = schedules.map((schedule) => {
        const attendanceSet = new Set(schedule.attendance);
        return {
          ...schedule,
          attendance: employeeDetails.map((employee) => ({
            username: employee.username,
            name: employee.name,
            attend: attendanceSet.has(employee.username),
          })),
        };
      });
    } else {
      schedules = schedules.map((schedule) => {
        const attendanceSet = new Set(schedule.attendance);
        const { attendance, ...rest } = schedule;
        return {
          ...rest,
          attend: attendanceSet.has(user.username),
        };
      });
    }

    if (schedules.length === 0) {
      return res
        .status(404)
        .json({ message: "No schedules found within the specified filter" });
    }

    return res.status(200).json({ schedules });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const deleteScheduleSchema = Joi.object({
  start_date: Joi.date().format("YYYY-MM-DD").required().messages({
    "date.base": `start_date must be a valid date`,
    "date.format": `start_date must be in the format YYYY-MM-DD`,
  }),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .required()
    .messages({
      "date.base": `end_date must be a valid date`,
      "date.format": `end_date must be in the format YYYY-MM-DD`,
      "date.min": `end_date must be greater than or equal to start_date`,
    }),
});

const deleteSchedule = async (req, res) => {
  const { start_date, end_date } = req.query;
  const username = req.body.user.username;

  const { error } = deleteScheduleSchema.validate({ start_date, end_date });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("schedules");
    const companyCollection = database.collection("users");

    const existingSchedules = await collection
      .find({
        username,
        date: { $gte: start_date, $lte: end_date },
      })
      .toArray();

    if (existingSchedules.length === 0) {
      return res.status(404).json({
        message: "No schedules found within the specified date range",
      });
    }

    const deletedSchedules = existingSchedules.map((schedule) => schedule.date);
    await collection.deleteMany({
      username,
      date: { $gte: start_date, $lte: end_date },
    });

    const company = await companyCollection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    let charge = deletedSchedules.length * 0.1;
    charge = parseFloat(charge.toFixed(2));

    let newBalance = parseFloat(company.balance) - charge;
    newBalance = parseFloat(newBalance.toFixed(2));

    await companyCollection.updateOne(
      { username },
      { $set: { balance: newBalance } }
    );

    const transCollection = database.collection("transactions");

    const trans = await transCollection.insertOne({
      username: username,
      type: `Delete schedules`,
      date: formateddate(),
      charge: charge,
      number_of_deleted_schedules: deletedSchedules.length,
      deleted_schedules: deletedSchedules,
    });

    if (trans.modifiedCount === 0) {
      return res
        .status(500)
        .json({ message: "Failed to save the transactions" });
    }

    return res.status(200).json({
      message: "Schedules deleted successfully",
      deleted_schedules: deletedSchedules,
      charge: `$${charge.toFixed(2)}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const upgradePlanSchema = Joi.object({
  plan_type: Joi.string().valid("standard", "premium").required(),
});

const checkBalance = (currentPlan, targetPlan, balance) => {
  const cost = {
    "free-standard": 30,
    "free-premium": 50,
    "standard-premium": 30,
  };
  const key = `${currentPlan}-${targetPlan}`;
  return balance >= cost[key]
    ? { sufficient: true, cost: cost[key] }
    : { sufficient: false, cost: 0 };
};

const upgradeCompanyPlanType = async (req, res) => {
  const { plan_type } = req.body;
  const username = req.body.user.username;

  try {
    const { error } = upgradePlanSchema.validate({ plan_type });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    const company = await collection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.plan_type === "premium") {
      return res.status(400).json({ message: "Has reached max plan type" });
    }

    if (company.plan_type === plan_type) {
      return res.status(400).json({ message: `Already on ${plan_type} plan` });
    }

    let hasSufficientBalance = false;
    let cost = 0;

    if (
      company.plan_type === "free" &&
      (plan_type === "standard" || plan_type === "premium")
    ) {
      const balanceCheck = checkBalance(
        company.plan_type,
        plan_type,
        company.balance
      );
      hasSufficientBalance = balanceCheck.sufficient;
      cost = balanceCheck.cost;
    } else if (company.plan_type === "standard" && plan_type === "premium") {
      const balanceCheck = checkBalance(
        company.plan_type,
        plan_type,
        company.balance
      );
      hasSufficientBalance = balanceCheck.sufficient;
      cost = balanceCheck.cost;
    }

    if (!hasSufficientBalance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = parseFloat(
      parseFloat(company.balance) - parseFloat(cost)
    );

    const result = await collection.updateOne(
      { username },
      { $set: { plan_type, balance: newBalance } }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to upgrade plan type" });
    }

    const transCollection = database.collection("transactions");
    cost = parseFloat(cost.toFixed(2));
    const trans = await transCollection.insertOne({
      username: username,
      type: `Upgrade plan type from ${req.body.user.plan_type} to ${plan_type}`,
      date: formateddate(),
      charge: cost,
    });

    if (trans.modifiedCount === 0) {
      return res
        .status(500)
        .json({ message: "Failed to save the transaction" });
    }

    return res
      .status(200)
      .json({ message: `Successful upgrade plan type to ${plan_type}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const generateInvitationCode = async (collection) => {
  let isUnique = false;
  let invitationCode;

  while (!isUnique) {
    const buffer = await crypto.randomBytes(6);

    invitationCode = buffer.toString("hex").toUpperCase();

    const existingCompany = await collection.findOne({
      invitation_code: invitationCode,
    });
    if (!existingCompany) {
      isUnique = true;
    }
  }

  return invitationCode;
};

const invitationLimitSchema = Joi.object({
  invitation_limit: Joi.number().integer().min(1).required(),
});

const generateCompanyInvitationCode = async (req, res) => {
  const { invitation_limit } = req.body;
  const username = req.body.user.username;

  try {
    const { error } = invitationLimitSchema.validate({ invitation_limit });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    const company = await collection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const invitationCode = await generateInvitationCode(collection);

    const parsedInvitationLimit = parseInt(invitation_limit, 10);

    const result = await collection.updateOne(
      { username },
      {
        $set: {
          invitation_code: invitationCode,
          invitation_limit: parsedInvitationLimit,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(500)
        .json({ message: "Failed to generate invitation code" });
    }

    return res.status(200).json({
      invitation_code: invitationCode,
      invitation_limit,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const amountSchema = Joi.object({
  amount: Joi.number()
    .min(5)
    .max(1000)
    .required()
    .custom((value, helpers) => {
      if (value.toFixed(2) != value) {
        return helpers.error("amount.invalid");
      }
      return value;
    }, "Decimal precision validation")
    .messages({
      "amount.invalid": "Amount must have at most two decimal places",
    }),
});

const companyTopUp = async (req, res) => {
  const { user, amount } = req.body;
  try {
    const { error } = amountSchema.validate({ amount });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("topups");

    const pendingTopup = await collection.findOne({
      username: user.username,
      status: "pending",
    });

    if (pendingTopup) {
      return res.status(400).send({
        message:
          "Please wait until latest topup attempt verified by our system",
      });
    }
    const currentDate = new Date();
    const datetime = `${currentDate.getFullYear()}-${padNumber(
      currentDate.getMonth() + 1
    )}-${padNumber(currentDate.getDate())} ${padNumber(
      currentDate.getHours()
    )}:${padNumber(currentDate.getMinutes())}`;

    function padNumber(number) {
      return number.toString().padStart(2, "0");
    }

    const topup_id = await generateTopupId();
    topup = await database.collection("topups").insertOne({
      topup_id: topup_id,
      username: user.username,
      amount: amount,
      status: "pending",
      created: datetime,
    });

    return res.status(201).send({
      topup_id: topup_id,
      amount: "$" + amount,
      status: "pending",
      time: datetime,
    });
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
  } finally {
    await client.close();
  }
};

async function generateTopupId() {
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("topups");
    let newTopupId = 1;

    const lastTopup = await collection
      .find()
      .sort({ topup_id: -1 })
      .limit(1)
      .toArray();

    if (lastTopup.length === 1) {
      const lastTopupId = lastTopup[0].topup_id;
      newTopupId = lastTopupId.toString();
      const newTopupIdInt = parseInt(newTopupId, 10);
      newTopupId = newTopupIdInt + 1;
    }
    return newTopupId;
  } catch (error) {
    console.error("Error generating new topup ID:", error);
    throw error;
  }
}
module.exports = {
  viewEmployeePicture,
  getEmployees,
  getEmployeesByUsername,
  removeEmployeesFromCompany,
  createSchedule,
  getSchedule,
  deleteSchedule,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
  companyTopUp,
};
