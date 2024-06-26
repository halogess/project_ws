const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storageProfile = (username) => {
  return multer.diskStorage({
    destination: (req, file, callback) => {
      // kalau req.body tidak terbaca, pastikan field dengan tipe file, berada dipaling bawah
      const foldername = `uploads/`;

      if (!fs.existsSync(foldername)) {
        fs.mkdirSync(foldername, { recursive: true });
      }

      callback(null, foldername);
    },
    filename: (req, file, callback) => {
      console.log(file);
      // ambil file extensionnya
      const fileExtension = path.extname(file.originalname).toLowerCase();

      callback(null, `${username}${fileExtension}`); //profpic.xlsx
    },
  });
};

const uploadPhoto = (username) => {
  return multer({
    storage: storageProfile(username),
    limits: {
      fileSize: 1000000, // dalam byte, jadi 1000 byte = 1kb, 1000000 byte = 1mb
    },
    fileFilter: (req, file, callback) => {
      // file type yang diperbolehkan, dalam bentuk regex
      const filetypes = /jpeg|jpg|png/;
      const fileExtension = path.extname(file.originalname).toLowerCase();

      const checkExtName = filetypes.test(fileExtension);
      const checkMimeType = filetypes.test(file.mimetype);

      if (checkExtName && checkMimeType) {
        callback(null, true);
      } else {
        callback(
          new Error("profile_picture extension must be .jpg, .jpeg, .png"),
          false
        );
      }
    },
  });
};

module.exports = { uploadPhoto };
