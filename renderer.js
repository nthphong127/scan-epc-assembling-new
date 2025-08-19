const { ipcRenderer } = require("electron");

//**************Kiểm tra mạng************//
var tableBody = document.getElementById("table-body");
let isNotificationVisible = false;
const Datastore = require("nedb");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const lang = process.env.lang || "en";
// Đường dẫn tới thư mục db và log
const logDir = path.join(__dirname, "logs");
const dbDir = path.join(__dirname, "db");
function loadLang(langCode) {
  const langFilePath = path.join(__dirname, "lang", `${langCode}.json`);
  try {
    const raw = fs.readFileSync(langFilePath, "utf-8");
    const data = JSON.parse(raw);
    currentDict = data; // <- gán vào biến toàn cục
    applyLang(data);
  } catch (err) {
    console.error("Không load được file ngôn ngữ:", err);
  }
}

function applyLang(dict) {
  // xử lý theo id như cũ
  Object.keys(dict).forEach((key) => {
    // set theo id (nếu có)
    const el = document.getElementById(key);
    if (el) el.innerText = dict[key];

    // set theo class (nếu trùng nhiều)
    const elements = document.querySelectorAll(`.${key}`);
    elements.forEach((e) => {
      e.innerText = dict[key];
    });
  });
}

// Hàm lấy ngày hiện tại dạng YYYY-MM-DD
function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

// Hàm định dạng lại thời gian theo kiểu "YYYY-MM-DD HH:mm:ss.SSS"
function formatDate(date) {
  const pad = (num, size = 2) => String(num).padStart(size, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}.${pad(date.getMilliseconds(), 3)}`
  );
}

// Hàm ghi log vào file
function logToFile(filePath, message) {
  const logEntry = {
    message,
    timestamp: formatDate(new Date()),
  };
  fs.appendFileSync(filePath, JSON.stringify(logEntry) + "\n");
}

// Hàm xóa các file log cũ hơn 3 ngày
function cleanOldLogs() {
  const todayStr = getTodayDateStr();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 3); // 3 ngày trước

  fs.readdirSync(logDir).forEach((file) => {
    if (file.endsWith(".log")) {
      const fileDateStr = file.split("_")[1].split(".")[0]; // Lấy ngày từ tên file (ví dụ: epc_success_2025-05-05.log)
      const fileDate = new Date(fileDateStr);

      if (fileDate < cutoffDate) {
        fs.unlinkSync(path.join(logDir, file)); // Xóa file cũ
      }
    }
  });
}

// Tạo thư mục db và logs nếu chưa có
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Xóa các file DB cũ không phải ngày hôm nay
fs.readdirSync(dbDir).forEach((file) => {
  const todayStr = getTodayDateStr();
  if (!file.includes(todayStr) && file.endsWith(".db")) {
    fs.unlinkSync(path.join(dbDir, file));
  }
});

// Tạo các DB file theo ngày
const errorDb = new Datastore({
  filename: path.join(dbDir, `errors_${getTodayDateStr()}.db`),
  autoload: true,
});
const lastDb = new Datastore({
  filename: path.join(dbDir, `last_${getTodayDateStr()}.db`),
  autoload: true,
});
const db = new Datastore({
  filename: path.join(dbDir, `epc_success_${getTodayDateStr()}.db`),
  autoload: true,
});

// Tạo các file log theo ngày
const successLogFile = path.join(
  logDir,
  `epc_success_${getTodayDateStr()}.log`
);
const failLogFile = path.join(logDir, `epc_fail_${getTodayDateStr()}.log`);

// Xóa các file log cũ hơn 3 ngày
cleanOldLogs();

let lastList = [];

function checkOnlineStatus() {
  const networkButton = document.getElementById("networkButton");
  const statusElement = document.getElementById("status");

  if (navigator.onLine) {
    fetch("https://httpbin.org/anything", {
      method: "HEAD",
      cache: "no-store",
    })
      .then((response) => {
        if (response.ok) {
          statusElement.innerText = currentDict.statusNetworkOnline;
          networkButton.classList.remove("offline");
          networkButton.classList.add("online");
          ipcRenderer.send("network-status", true); // Gửi trạng thái online
          isNotificationVisible = false;
        } else {
          statusElement.innerText = currentDict.statusNetworkOffline;
          networkButton.classList.remove("online");
          networkButton.classList.add("offline");
          ipcRenderer.send("network-status", false);
        }
      })
      .catch(() => {
        statusElement.innerText = currentDict.statusNetworkOffline;
        networkButton.classList.remove("online");
        networkButton.classList.add("offline");
        ipcRenderer.send("network-status", false); // Gửi trạng thái offline
      });
  } else {
    statusElement.innerText = currentDict.statusNetworkOffline;
    networkButton.classList.remove("online");
    networkButton.classList.add("offline");
    ipcRenderer.send("network-status", false); // Gửi trạng thái offline
  }
}

window.addEventListener("online", () => {
  checkOnlineStatus();
});
window.addEventListener("offline", () => {
  checkOnlineStatus();
});

// Update the status every 3 seconds
setInterval(checkOnlineStatus, 2000);

//**************Hiển thị thời gian************//
function updateTime() {
  const currentDate = new Date();
  const dateFormatted = currentDate.toLocaleString();
  document.getElementById("timer").innerText = `TIME: ${dateFormatted}`;
}

setInterval(updateTime, 1000);

//**************Đếm số lượng tem mình************//
async function fetchDataCount() {
  const dataCountElement = document.getElementById("data-count");

  try {
    const result = await ipcRenderer.invoke("get-data-count");
    if (result.success) {
      dataCountElement.innerText = `${result.count}`;
      dataCountElement.style.color = "white";
    } else {
      console.log(`Error: ${result.message}`);
      // dataCountElement.style.color = "red";
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
    // dataCountElement.innerText = `Error: ${error.message}`;
    // dataCountElement.style.color = "red";
  }
}

//**************Đếm số lượng tem khách***********//
async function fetchDataCountCus() {
  const dataCountElement = document.getElementById("data-count-cus");

  try {
    const result = await ipcRenderer.invoke("get-data-count-cus");
    if (result.success) {
      dataCountElement.innerText = `${result.count}`;
      dataCountElement.style.color = "white";
    } else {
      // dataCountElement.innerText = `Error: ${result.message}`;
      // dataCountElement.style.color = "red";
    }
  } catch (error) {
    // dataCountElement.innerText = `Error: ${error.message}`;
    // dataCountElement.style.color = "red";
  }
}

//**************TABLE***********//
async function renderTable() {
  // Lấy dữ liệu từ backend
  const data = await fetchTableData();

  // Hiển thị dữ liệu trong bảng
  tableBody.innerHTML = ""; // Clear existing rows
  data.map((item) => {
    const row = document.createElement("tr");
    row.setAttribute("data-keyid", item.matchkeyid);
    const epcCell = document.createElement("td");
    epcCell.textContent = item.EPC_Code;

    const sizeCell = document.createElement("td");
    sizeCell.textContent = item.size_code;

    const monoCell = document.createElement("td");
    monoCell.textContent = item.mo_no;

    const actionCell = document.createElement("td");
    const deleteIcon = document.createElement("span");
    deleteIcon.textContent = "Xóa";
    deleteIcon.classList.add("delete-icon");
    deleteIcon.addEventListener("click", () => {
      const matchkeyid = row.getAttribute("data-keyid");
      deleteRow(item.EPC_Code, matchkeyid);
    });
    actionCell.appendChild(deleteIcon);

    row.appendChild(epcCell);
    row.appendChild(sizeCell);
    row.appendChild(monoCell);
    row.appendChild(actionCell);
    tableBody.appendChild(row);
  });
}

//**************Lấy data show vào table ***********//
async function fetchTableData() {
  try {
    // const dayNow = getStartOfToday();

    // Gọi IPC để lấy dữ liệu từ backend
    const result = await ipcRenderer.invoke(
      "get-top-epc-records"
      // dayNow
    );

    if (result.success) {
      return result.records; // Trả về dữ liệu từ backend
    } else {
      console.error("Error fetching data:", result.message);
      return [];
    }
  } catch (err) {
    console.error("Error fetching table data:", err);
    return [];
  }
}

//************** Xóa EPC ***********//
async function deleteRow(epcCode, keyid) {
  try {
    const confirmation = await ipcRenderer.invoke(
      "show-confirm-dialog",
      `Bạn có chắc chắn muốn xóa EPC Code: ${epcCode}?`
    );

    if (confirmation) {
      const result = await ipcRenderer.invoke("delete-epc-record", keyid);

      if (result.success) {
        await renderTable();
        await fetchDataCount();
        epcCodeInput.focus();
      } else {
        console.error("Error deleting EPC record:", result.message);
      }
    } else {
      epcCodeInput.focus();
    }
  } catch (err) {
    console.error("Error deleting EPC record:", err);
  }
}

//**************Quét tem***********//
const epcCodeInput = document.getElementById("epc-code");
const successAnimation = document.getElementById("success-animation");
let typingTimeout;

epcCodeInput.addEventListener("input", () => {
  epcCodeInput.value = epcCodeInput.value.toUpperCase();
  // Nếu người dùng gõ lại, hủy timeout cũ
  clearTimeout(typingTimeout);

  // Thiết lập timeout mới, 500ms sau khi ngừng gõ
  typingTimeout = setTimeout(() => {
    // Lấy giá trị người dùng đã nhập
    const epcCode = epcCodeInput.value;

    if (epcCode.length !== 24 || !epcCode.startsWith("E")) {
      console.warn("EPC code must be 24 characters long and start with 'E'.");
      epcCodeInput.value = ""; // Xóa nội dung input
      return;
    }

    // Nếu epcCode có giá trị, gọi stored procedure
    if (epcCode) {
      ipcRenderer.invoke("check-assembly-status", epcCode).then((status) => {
        console.log(status.match);

        if (status.match === false) {
          const notificationCenter = document.createElement("div");
          notificationCenter.className = "notificationCenter error";
          // notificationCenter.innerText = currentDict.epcNotMatchStation + ` ${epcCode}`;
          notificationCenter.innerHTML = `
<svg fill="#000000" width="34px" height="34px" viewBox="0 0 64 64" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <rect id="Icons" x="-640" y="-64" width="1280" height="800" style="fill:none;"></rect> <g id="Icons1" serif:id="Icons"> <g id="Strike"> </g> <g id="H1"> </g> <g id="H2"> </g> <g id="H3"> </g> <g id="list-ul"> </g> <g id="hamburger-1"> </g> <g id="hamburger-2"> </g> <g id="list-ol"> </g> <g id="list-task"> </g> <g id="trash"> </g> <g id="vertical-menu"> </g> <g id="horizontal-menu"> </g> <g id="sidebar-2"> </g> <g id="Pen"> </g> <g id="Pen1" serif:id="Pen"> </g> <g id="clock"> </g> <g id="external-link"> </g> <g id="hr"> </g> <g id="info"> </g> <g id="warning"> <path d="M32.427,7.987c2.183,0.124 4,1.165 5.096,3.281l17.936,36.208c1.739,3.66 -0.954,8.585 -5.373,8.656l-36.119,0c-4.022,-0.064 -7.322,-4.631 -5.352,-8.696l18.271,-36.207c0.342,-0.65 0.498,-0.838 0.793,-1.179c1.186,-1.375 2.483,-2.111 4.748,-2.063Zm-0.295,3.997c-0.687,0.034 -1.316,0.419 -1.659,1.017c-6.312,11.979 -12.397,24.081 -18.301,36.267c-0.546,1.225 0.391,2.797 1.762,2.863c12.06,0.195 24.125,0.195 36.185,0c1.325,-0.064 2.321,-1.584 1.769,-2.85c-5.793,-12.184 -11.765,-24.286 -17.966,-36.267c-0.366,-0.651 -0.903,-1.042 -1.79,-1.03Z" style="fill-rule:nonzero;"></path> <path d="M33.631,40.581l-3.348,0l-0.368,-16.449l4.1,0l-0.384,16.449Zm-3.828,5.03c0,-0.609 0.197,-1.113 0.592,-1.514c0.396,-0.4 0.935,-0.601 1.618,-0.601c0.684,0 1.223,0.201 1.618,0.601c0.395,0.401 0.593,0.905 0.593,1.514c0,0.587 -0.193,1.078 -0.577,1.473c-0.385,0.395 -0.929,0.593 -1.634,0.593c-0.705,0 -1.249,-0.198 -1.634,-0.593c-0.384,-0.395 -0.576,-0.886 -0.576,-1.473Z" style="fill-rule:nonzero;"></path> </g> <g id="plus-circle"> </g> <g id="minus-circle"> </g> <g id="vue"> </g> <g id="cog"> </g> <g id="logo"> </g> <g id="radio-check"> </g> <g id="eye-slash"> </g> <g id="eye"> </g> <g id="toggle-off"> </g> <g id="shredder"> </g> <g id="spinner--loading--dots-" serif:id="spinner [loading, dots]"> </g> <g id="react"> </g> <g id="check-selected"> </g> <g id="turn-off"> </g> <g id="code-block"> </g> <g id="user"> </g> <g id="coffee-bean"> </g> <g id="coffee-beans"> <g id="coffee-bean1" serif:id="coffee-bean"> </g> </g> <g id="coffee-bean-filled"> </g> <g id="coffee-beans-filled"> <g id="coffee-bean2" serif:id="coffee-bean"> </g> </g> <g id="clipboard"> </g> <g id="clipboard-paste"> </g> <g id="clipboard-copy"> </g> <g id="Layer1"> </g> </g> </g></svg>
  ${currentDict.epcNotMatchStation} ${epcCode}
`;
          document.body.appendChild(notificationCenter);
          lastList.push(epcCode);
          errorDb.findOne({ epc: epcCode }, (err, existingError) => {
            if (err) {
              console.error("Lỗi DB khi kiểm tra lỗi EPC:", err);
              return;
            }

            if (!existingError) {
              const record = {
                epc: epcCode,
                record_time: formatDate(new Date()),
                reason: "Sai trạm(扫错站点)",
              };
              errorDb.insert(record);
            }
          });
          setTimeout(() => {
            notificationCenter.remove();
          }, 5000);
          epcCodeInput.disabled = false;
          // epcCodeInput.focus();
          epcCodeInput.value = "";
          epcCodeInput.focus();
        }
        addEPCRow(epcCode);
        epcCodeInput.disabled = true;
        // Gọi hàm trong main process để xử lý stored procedure

        ipcRenderer
          .invoke("call-sp-upsert-epc", epcCode)
          .then(async (result) => {
            if (result.success && result.returnValue == 0) {
              const notification = document.createElement("div");
              notification.className = "notification error";
              notification.innerText = currentDict.epcNotNatch + epcCode;
              document.body.appendChild(notification);

              // Ẩn thông báo sau 3 giây
              setTimeout(() => {
                notification.remove();
              }, 5000);
              errorList.push(epcCode);
              errorDb.findOne({ epc: epcCode }, (err, existingError) => {
                if (err) {
                  console.error("Lỗi DB khi kiểm tra lỗi EPC:", err);
                  return;
                }

                if (!existingError) {
                  const record = {
                    epc: epcCode,
                    record_time: formatDate(new Date()),
                    reason: "not Match",
                  };
                  errorDb.insert(record);
                }
              });
              logToFile(failLogFile, `EPC ${epcCode}`);
            
              return;
            }
            if (result.success && result.returnValue == -1) {
              const notification = document.createElement("div");
              notification.className = "notification error";
              notification.innerText = currentDict.epcScanPrev + `  ` + epcCode;
              document.body.appendChild(notification);

              lastList.push(epcCode);

              // Ghi log vào file epc_duplicate.log
              logToFile(failLogFile, `EPC ${epcCode}`);
        
              setTimeout(() => {
                notification.remove();
              }, 5000);
            }
            if (result.success && result.returnValue === 1) {
              saveEpcIfNew(epcCode, (err, isNew, doc) => {
                if (err) {
                  console.error("Lỗi khi lưu DB:", err);
                  return;
                }
                if (!isNew) {
                  // Đã quét rồi, hiển thị thông báo
                  const notification = document.createElement("div");
                  notification.className = "  error";
                  document.body.appendChild(notification);
                  lastList.push(epcCode);
                  setTimeout(() => {
                    notification.remove();
                  }, 5000);
                } else {
                  logToFile(successLogFile, `${epcCode}`);
                }
              });
            }

            renderTable();
            fetchDataCount();
            fetchDataCountCus();
            updateErrorCount();
            updateLastCount();
            successAnimation.classList.remove("hidden");
            successAnimation.classList.add("show");

            // Ẩn animation sau 1.5 giây
            setTimeout(() => {
              successAnimation.classList.remove("show");
              successAnimation.classList.add("hidden");
            }, 1000);
          })
          .catch((error) => {
            console.error("Error in stored procedure call:", error);
          })
          .finally(() => {
            epcCodeInput.disabled = false;
            // epcCodeInput.focus();
            epcCodeInput.value = "";
            epcCodeInput.focus();
          });
      });
    }

    // Sau khi xử lý xong, xóa nội dung của input và focus lại
  }, 200); // 500ms = 0.5 giây
});

// Hàm thêm EPC vào bảng ngay lập tức
function addEPCRow(epcCode) {
  const row = document.createElement("tr");

  const epcCell = document.createElement("td");
  epcCell.textContent = epcCode;

  const sizeCell = document.createElement("td");
  sizeCell.textContent = ""; // Tạm thời để trống

  const monoCell = document.createElement("td");
  monoCell.textContent = ""; // Tạm thời để trống

  const actionCell = document.createElement("td");
  const deleteIcon = document.createElement("span");
  deleteIcon.textContent = "Xóa";
  deleteIcon.classList.add("delete-icon");

  row.appendChild(epcCell);
  row.appendChild(sizeCell);
  row.appendChild(monoCell);
  row.appendChild(actionCell);

  if (tableBody.firstChild) {
    tableBody.insertBefore(row, tableBody.firstChild); // Thêm hàng vào đầu
  } else {
    tableBody.appendChild(row); // Nếu bảng trống, thêm vào đầu tiên
  }
}

function syncOfflineData() {
  const loadingIndicator = document.getElementById("loading-indicator");
  loadingIndicator.style.display = "flex"; // Hiển thị trạng thái loading

  ipcRenderer
    .invoke("sync-offline-data")
    .then((result) => {
      if (result && result.success) {
        // alert("Khởi động, và đồng bộ dữ liệu thành công !");
      } else {
        console.error(
          "Error syncing offline data:",
          result?.message || "Unknown error."
        );
      }
    })
    .catch((error) => {
      console.error("Error during sync:", error.message);
    })
    .finally(() => {
      loadingIndicator.style.display = "none";
    });
}

document.addEventListener("DOMContentLoaded", async () => {
  epcCodeInput.focus();
  if (navigator.onLine) {
    try {
      renderTable();
      fetchDataCountCus();
      fetchDataCount();
      syncOfflineData();
    } catch (error) {
      console.error("An error occurred during initialization:", error);
    }
  } else {
    console.log("App started offline. No sync will be performed.");
  }
});
document.addEventListener("DOMContentLoaded", () => {
  loadLang(lang);
});

document.addEventListener("click", (event) => {
  const epcCodeInput = document.getElementById("epc-code");

  if (event.target !== epcCodeInput) {
    epcCodeInput.focus();
  }
});

const stationNo = process.env.STATION_NO;

const stationElement = document.querySelector("h2");
if (stationElement) {
  stationElement.textContent = `TRẠM ${stationNo}`;
}
const versionApp = process.env.VERSION_APP;

const versionElement = document.querySelector("title");
if (versionElement) {
  versionElement.textContent = `SCAN EPC ${versionApp}`;
}

// modal
const errorBtn = document.querySelector(".error-epc-btn");
const modal = document.getElementById("error-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const errorTableBody = document.getElementById("error-table-body");
let errorList = [];
errorBtn.addEventListener("click", () => {
  updateErrorTable();
  modal.style.display = "flex";
});

// Cập nhật bảng tem lỗi
function updateErrorTable() {
  errorTableBody.innerHTML = ""; // Xóa nội dung cũ
  if (errorList.length === 0) {
    errorTableBody.innerHTML = `<tr><td colspan="2">${currentDict.noEpcError}</td></tr>`;
    return;
  }
  errorList.forEach((error, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${error}</td>

    `;
    errorTableBody.appendChild(row);
  });

  // Thêm sự kiện xóa cho từng nút
}

// Đóng modal khi bấm nút close
closeModalBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

// Ẩn modal khi bấm bên ngoài modal-content
window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// Hàm cập nhật số lượng tem lỗi
function updateErrorCount() {
  errorDb.count({}, (err, count) => {
    if (err) {
      console.error("Failed to count errors in database:", err);
    } else {
      const errorCountSpan = document.getElementById("error-count");
      errorCountSpan.textContent = count; // Hiển thị số lượng tem lỗi
    }
  });
}

updateErrorCount();
// xóa error cuối ngày

function cleanOldData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  errorDb.remove(
    { timestamp: { $lt: today.toISOString() } },
    { multi: true },
    (err, numRemoved) => {
      if (err) {
        console.error("Có lỗi xảy ra khi xóa dữ liệu:", err);
      } else {
        updateErrorCount();
      }
    }
  );
}

cleanOldData();

function updateErrorTable() {
  errorDb.find({}, (err, docs) => {
    if (err) {
      console.error("Failed to load errors from database:", err);
      return;
    }

    errorTableBody.innerHTML = ""; // Xóa nội dung cũ
    if (docs.length === 0) {
      errorTableBody.innerHTML = `<tr><td colspan="2">${currentDict.noEpcError}</td></tr>`;
      return;
    }

    docs.forEach((doc, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${doc.epc}</td>
        <td>
          <span >${doc.reason}</span>
        </td>
      `;
      errorTableBody.appendChild(row);
    });

    // Thêm sự kiện xóa cho từng nút
    document.querySelectorAll(".delete-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        const id = event.target.dataset.id;
        removeError(id);
      });
    });
  });
}

function removeError(id) {
  errorDb.remove({ _id: id }, {}, (err, numRemoved) => {
    if (err) {
      console.error("Failed to remove error from database:", err);
    } else {
      updateErrorTable(); // Cập nhật lại bảng
      updateErrorCount(); // Cập nhật số lượng
    }
  });
}

const lastBtn = document.querySelector(".last-epc-btn");
const modalLast = document.getElementById("last-modal");
const closeModalLastBtn = document.getElementById("close-last-btn");
const lastTableBody = document.getElementById("last-table-body");

lastBtn.addEventListener("click", () => {
  updateLastTable();
  modalLast.style.display = "flex";
});

function updateLastCount() {
  lastDb.count({}, (err, count) => {
    if (err) {
      console.error("Failed to count errors in database:", err);
    } else {
      const lastCountSpan = document.getElementById("last-count");
      lastCountSpan.textContent = count; // Hiển thị số lượng tem lỗi
    }
  });
}

updateLastCount();

// Cập nhật bảng tem lỗi
function updateLastTable() {
  lastTableBody.innerHTML = ""; // Xóa nội dung cũ
  if (lastList.length === 0) {
    lastTableBody.innerHTML = `<tr><td colspan="2">${currentDict.noEpcError}</td></tr>`;
    return;
  }
  lastList.forEach((error, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${error}</td>

    `;
    lastTableBody.appendChild(row);
  });

  // Thêm sự kiện xóa cho từng nút
}

// Đóng modal khi bấm nút close
closeModalLastBtn.addEventListener("click", () => {
  modalLast.style.display = "none";
});

// Ẩn modal khi bấm bên ngoài modal-content
window.addEventListener("click", (event) => {
  if (event.target === modalLast) {
    modalLast.style.display = "none";
  }
});

// Hàm cập nhật số lượng tem lỗi

// xóa error cuối ngày

function cleanOldDataLast() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  lastDb.remove(
    { timestamp: { $lt: today.toISOString() } },
    { multi: true },
    (err, numRemoved) => {
      if (err) {
        console.error("Error:", err);
      } else {
        updateLastCount();
      }
    }
  );
}

cleanOldDataLast();

// xem lỗi

function updateLastTable() {
  lastDb.find({}, (err, docs) => {
    if (err) {
      console.error("Failed to load errors from database:", err);
      return;
    }

    lastTableBody.innerHTML = ""; // Xóa nội dung cũ
    if (docs.length === 0) {
      lastTableBody.innerHTML = `<tr><td colspan="2">${currentDict.noEpcError}</td></tr>`;
      return;
    }
    console.log(docs);

    docs.forEach((doc, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${doc.epc}</td>
        <td>
          <span class="delete-last-btn" data-id="${doc._id}">${currentDict.delete}</span>
        </td>
      `;
      lastTableBody.appendChild(row);
    });

    // Thêm sự kiện xóa cho từng nút
    document.querySelectorAll(".delete-last-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        const id = event.target.dataset.id;
        removeLast(id);
      });
    });
  });
}

function removeLast(id) {
  lastDb.remove({ _id: id }, {}, (err, numRemoved) => {
    if (err) {
      console.error("Failed to remove error from database:", err);
    } else {
      updateLastTable(); // Cập nhật lại bảng
      updateLastCount(); // Cập nhật số lượng
    }
  });
}

function formatDate(date) {
  const pad = (num, size = 2) => String(num).padStart(size, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}.${pad(date.getMilliseconds(), 3)}`
  );
}

function saveEpcIfNew(epc, callback) {
  db.findOne({ epc }, (err, doc) => {
    if (err) return callback(err);

    if (doc) {
      // Đã tồn tại
      callback(null, false, doc);
    } else {
      const record = {
        epc,
        record_time: formatDate(new Date()),
      };
      db.insert(record, (err, newDoc) => {
        if (err) return callback(err);
        callback(null, true, newDoc);
      });
    }
  });
}

async function fetchTargetQty() {
  try {
    const response = await ipcRenderer.invoke("get-qty-target");

    if (response.success && response.record) {
      console.log("goi qty target thanh cong");

      document.getElementById("target-count").textContent =
        response.record.pr_qty;
    } else {
      console.error("Không có dữ liệu hoặc lỗi:", response.message);
      document.getElementById("target-count").textContent = "0";
    }
  } catch (err) {
    console.error("Lỗi khi gọi ipcRenderer:", err);
    document.getElementById("target-count").textContent = "0";
  }
}

fetchTargetQty();
setInterval(() => {
  fetchTargetQty();
}, 30 * 60 * 1000);
