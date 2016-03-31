//const docusign = require('docusign-esign');
const xmlParser = require('xml2js');
const fs = require('fs');
const path = require('path');

const dsRecipeLib = require('./dsRecipeLib');
var docusign

function WebhookLib() {
	// Settings
	//
	this.dsUserEmail = "***";
	this.dsUserPw = "***";
	this.dsIntegrationId = "***";
	this.dsSigner1Name = "***"; // Set signer info here or leave as is
	// to use example signers
	this.dsSigner1Email = "***";
	this.dsCC1Name = "***"; // Set a cc recipient here or leave as is
	// to use example recipients
	this.dsCC1Email = "***";
	this.dsAccountId; // Set during login process or explicitly by
	// configuration here.
	// Note that many customers have more than one account!
	// A username/pw can access multiple accounts!
	this.dsBaseUrl; // The base url associated with the account_id.
	this.dsAuthHeader;
	this.myUrl; // The url for this script. Must be accessible from the
	// internet!
	// Can be set here or determined dynamically
	this.webhookUrl;
	this.docFilename = "sample_documents_master/NDA.pdf";
	this.docDocumentName = "NDA.pdf";
	this.docFiletype = "application/pdf";

	this.webhookSuffix = "/webhook";

	this.xmlFileDir = "public/";
	this.docPrefix = "doc_";

	////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////
	docusign = dsRecipeLib.init(this.dsUserEmail, this.dsUserPw, this.dsIntegrationId, this.dsAccountId);
	this.myUrl = dsRecipeLib.getMyUrl(this.myUrl);

	////////////////////////////////////////////////////////////////////////
};

WebhookLib.prototype.send1 = function(url, html, callback) {
	// Prepares for sending the envelope
	var self = this;
	this.login(function(result) {
		if ("false" === result.ok) {
			callback(result, html);
		}
		self.myUrl = url;

		self.webhookUrl = (!!self.myUrl && self.myUrl !== '') ? self.myUrl + self.webhookSuffix : "http://localhost:5000/" + self.webhookSuffix;
		self.dsSigner1Name = dsRecipeLib.getSignerName(self.dsSigner1Name);
		self.dsSigner1Email = dsRecipeLib.getSignerEmail(self.dsSigner1Email);
		self.dsCC1Name = dsRecipeLib.getSignerName(self.dsCC1Name);
		self.dsCC1Email = dsRecipeLib.getSignerEmail(self.dsCC1Email);

		callback(result, html);
	});
};

WebhookLib.prototype.login = function(callback) {
	var map = {};
	var self = this;

	// Logs into DocuSign
	dsRecipeLib.login(function(result) {
		if ("true" === result.ok) {
			self.dsAccountId = dsRecipeLib.getDsAccountId();
			self.dsBaseUrl = dsRecipeLib.getDsBaseUrl();
			self.dsAuthHeader = dsRecipeLib.getDsAuthHeader();
			map.ok = "true";
		} else {
			map.ok = "false";
			map.errMsg = result.errMsg;
		}
		callback(map);
	});
};

WebhookLib.prototype.getDsAccountId = function() {
	return this.dsAccountId;
};

WebhookLib.prototype.setDsAccountId = function(accountId) {
	this.dsAccountId = accountId;
};

WebhookLib.prototype.getDsSigner1Name = function() {
	return this.dsSigner1Name;
};

WebhookLib.prototype.getWebhookUrl = function() {
	return this.webhookUrl;
};

WebhookLib.prototype.webhookListener = function(data) {
	// Process the incoming webhook data. See the DocuSign Connect guide
	// for more information
	//
	// Strategy: examine the data to pull out the envelopeId and
	// time_generated fields.
	// Then store the entire xml on our local file system using those
	// fields.
	//
	// If the envelope status==="Completed" then store the files as doc1.pdf,
	// doc2.pdf, etc
	//
	// This function could also enter the data into a dbms, add it to a
	// queue, etc.
	// Note that the total processing time of this function must be less
	// than
	// 100 seconds to ensure that DocuSign's request to your app doesn't
	// time out.
	// Tip: aim for no more than a couple of seconds! Use a separate queuing
	// service
	// if need be.
	var self = this;
	console.log("Data received from DS Connect: " + JSON.stringify(data));
	xmlParser.parseString(data, function(err, xml) {
		if (err || !xml) {
			throw new Error("Cannot parse Connect XML results: " + err);
		}

		console.log("Connect data parsed!");
		var envelopeStatus = xml.DocuSignEnvelopeInformation.EnvelopeStatus;
		var envelopeId = envelopeStatus[0].EnvelopeID[0];
		var timeGenerated = envelopeStatus[0].TimeGenerated[0];

		// Store the file. Create directories as needed
		// Some systems might still not like files or directories to start
		// with numbers.
		// So we prefix the envelope ids with E and the timestamps with T
		var filesDir = path.resolve(__filename + "/../../" + self.xmlFileDir);
		console.log("filesDir=" + filesDir);
		if (!fs.existsSync(filesDir)) {
			if (!fs.mkdirSync(filesDir, 0755))
				console.log("Cannot create folder: " + filesDir);
		}
		var envelopeDir = path.resolve(__filename + "/../../" + self.xmlFileDir + "E" + envelopeId);
		console.log("envelopeDir=" + envelopeDir);
		if (!fs.existsSync(envelopeDir)) {
			if (!fs.mkdirSync(envelopeDir, 0755))
				console.log("Cannot create folder: " + envelopeDir);
		}
		var filename = path.resolve(__filename + "/../../" + self.xmlFileDir + "E" + envelopeId + "/T" + timeGenerated.replace(/:/g, '_') + ".xml");
		console.log("filename=" + filename);
		try {
			fs.writeFileSync(filename, data);
		} catch (ex) {
			// Couldn't write the file! Alert the humans!
			console.error("!!!!!! PROBLEM DocuSign Webhook: Couldn't store xml " + filename + " !");
			return;
		}

		// log the event
		console.log("DocuSign Webhook: created " + filename);

		if ("Completed" === envelopeStatus[0].Status[0]) {
			// Loop through the DocumentPDFs element, storing each document.
			nodeList = xml.DocuSignEnvelopeInformation.DocumentPDFs[0].DocumentPDF;
			for (var i = 0; i < nodeList.length; i++) {
				var pdf = nodeList[i];
				filename = "doc_" + (pdf.DocumentID ? pdf.DocumentID[0] : "") + ".pdf";
				var fullFilename = path.resolve(__filename + "/../../" + self.xmlFileDir + "E" + envelopeId + "/" + filename);
				try {
					fs.writeFileSync(fullFilename, pdf.PDFBytes[0]);
				} catch (ex) {
					// Couldn't write the file! Alert the humans!
					console.error("!!!!!! PROBLEM DocuSign Webhook: Couldn't store pdf " + filename + " !");
					return;
				}
			}
		}
		return;
	});
};

WebhookLib.prototype.send2 = function(params, callback) {
	// Send the envelope
	// params --
	// "ds_signer1_name"
	// "ds_signer1_email"
	// "ds_cc1_name"
	// "ds_cc1_email"
	// "webhook_url"
	// "baseurl"
	var self = this;
	this.login(function(result) {
		if ("false" === result.ok) {
			return callback("{\"ok\": false, \"html\": \"<h3>Problem</h3><p>Couldn't login to DocuSign: " + result.errMsg + "</p>\"}");
		}
		self.webhookUrl = params.webhook_url;
		self.dsSigner1Name = params.ds_signer1_name;
		self.dsSigner1Email = params.ds_signer1_email;
		self.dsCC1Name = params.ds_cc1_name;
		self.dsCC1Email = params.ds_cc1_email;
		// The envelope request includes a signer-recipient and their tabs
		// object,
		// and an eventNotification object which sets the parameters for
		// webhook notifications to us from the DocuSign platform
		var envelopeEvents = [];
		var envelopeEvent = new docusign.EnvelopeEvent();
		envelopeEvent.setEnvelopeEventStatusCode("sent");
		envelopeEvents.push(envelopeEvent);
		envelopeEvent = new docusign.EnvelopeEvent();
		envelopeEvent.setEnvelopeEventStatusCode("delivered");
		envelopeEvents.push(envelopeEvent);
		envelopeEvent = new docusign.EnvelopeEvent();
		envelopeEvent.setEnvelopeEventStatusCode("completed");
		envelopeEvents.push(envelopeEvent);
		envelopeEvent = new docusign.EnvelopeEvent();
		envelopeEvent.setEnvelopeEventStatusCode("declined");
		envelopeEvents.push(envelopeEvent);
		envelopeEvent = new docusign.EnvelopeEvent();
		envelopeEvent.setEnvelopeEventStatusCode("voided");
		envelopeEvents.push(envelopeEvent);

		var recipientEvents = [];
		var recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("Sent");
		recipientEvents.push(recipientEvent);
		recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("Delivered");
		recipientEvents.push(recipientEvent);
		recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("Completed");
		recipientEvents.push(recipientEvent);
		recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("Declined");
		recipientEvents.push(recipientEvent);
		recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("AuthenticationFailed");
		recipientEvents.push(recipientEvent);
		recipientEvent = new docusign.RecipientEvent();
		recipientEvent.setRecipientEventStatusCode("AutoResponded");
		recipientEvents.push(recipientEvent);

		var eventNotification = new docusign.EventNotification();
		eventNotification.setUrl(self.webhookUrl);
		eventNotification.setLoggingEnabled("true");
		eventNotification.setRequireAcknowledgment("true");
		eventNotification.setUseSoapInterface("false");
		eventNotification.setIncludeCertificateWithSoap("false");
		eventNotification.setSignMessageWithX509Cert("false");
		eventNotification.setIncludeDocuments("true");
		eventNotification.setIncludeEnvelopeVoidReason("true");
		eventNotification.setIncludeTimeZone("true");
		eventNotification.setIncludeSenderAccountAsCustomField("true");
		eventNotification.setIncludeDocumentFields("true");
		eventNotification.setIncludeCertificateOfCompletion("true");
		eventNotification.setEnvelopeEvents(envelopeEvents);
		eventNotification.setRecipientEvents(recipientEvents);

		var fileBytes = null;
		try {
			// read file from a local directory
			fileBytes = fs.readFileSync(path.resolve(__filename + '/../../public/' + self.docFilename));
		} catch (ex) {
			return callback("{\"ok\": false, \"html\": \"<h3>Problem</h3><p>Couldn't load local envelope document: " + ex + "</p>\"}");
		}

		var doc = new docusign.Document();
		var base64Doc = new Buffer(fileBytes).toString('base64');
		doc.setDocumentId("1");
		doc.setName(self.docDocumentName);
		doc.setDocumentBase64(base64Doc);
		var documents = [];
		documents.push(doc);
		var signer = new docusign.Signer();
		signer.setEmail(self.dsSigner1Email);
		signer.setName(self.dsSigner1Name);
		signer.setRecipientId("1");
		signer.setRoutingOrder("1");
		signer.setTabs(getNdaFields());
		var signers = [];
		signers.push(signer);
		var carbonCopy = new docusign.CarbonCopy();
		carbonCopy.setEmail(self.dsCC1Email);
		carbonCopy.setName(self.dsCC1Name);
		carbonCopy.setRecipientId("2");
		carbonCopy.setRoutingOrder("2");
		var carbonCopies = [];
		carbonCopies.push(carbonCopy);
		var recipients = new docusign.Recipients();
		recipients.setSigners(signers);
		recipients.setCarbonCopies(carbonCopies);
		var envelopeDefinition = new docusign.EnvelopeDefinition();
		// We want to use the most friendly email subject line.
		// The regexp below removes the suffix from the file name.
		envelopeDefinition.setEmailSubject("Please sign the " + self.docDocumentName.replace(/\\.[^.\\s]{3,4}/g, '') + " document");
		envelopeDefinition.setDocuments(documents);
		envelopeDefinition.setRecipients(recipients);
		envelopeDefinition.setEventNotification(eventNotification);
		envelopeDefinition.setStatus("sent");
		// Remove null properties from the envelope definition. See Issue https://github.com/docusign/docusign-node-client/issues/47
		removeNulls(envelopeDefinition);
		// Send the envelope:
		var envelopesApi = new docusign.EnvelopesApi();
		envelopesApi.createEnvelope(self.dsAccountId, envelopeDefinition, null, function(error, envelopeSummary, response) {
			if (error || !envelopeSummary || !envelopeSummary.envelopeId) {
				return callback("{\"ok\": false, \"html\": \"<h3>Problem</h3> \r\n  <p>Error sending DocuSign envelope</p>" + error + "\"}");
			}
			var envelopeId = envelopeSummary.envelopeId;
			// Create instructions for reading the email
			var html = "<h2>Signature request sent!</h2><p>Envelope ID: " + envelopeId + "</p>";
			html += "<h2>Next steps</h2>" + "<h3>1. Open the Webhook Event Viewer</h3>";
			html += "<p><a href='" + (!!params.baseurl ? params.baseurl : "/") + "?op=status&envelope_id=" + encodeURIComponent(envelopeId) + "'";
			html += "  class='btn btn-primary' role='button' target='_blank' style='margin-right:1.5em;'>";
			html += "View Events</a> (A new tab/window will be used.)</p>";
			html += "<h3>2. Respond to the Signature Request</h3>";
			var emailAccess = dsRecipeLib.getTempEmailAccess(self.dsSigner1Email);
			if (!!emailAccess) {
				// A temp account was used for the email
				html += "<p>Respond to the request via your mobile phone by using the QR code: </p>";
				html += "<p>" + dsRecipeLib.getTempEmailAccessQrcode(emailAccess) + "</p>";
				html += "<p> or via <a target='_blank' href='" + emailAccess + "'>your web browser.</a></p>";
			} else {
				// A regular email account was used
				html += "<p>Respond to the request via your mobile phone or other mail tool.</p>";
				html += "<p>The email was sent to " + self.dsSigner1Name + " &lt;" + self.dsSigner1Email + "&gt;</p>";
			}
			return callback("{ \"ok\": true, \r\n \"envelope_id\": \"" + envelopeId + "\", \r\n \"html\": \"" + html + "\", \r\n \"js\": [{\"disable_button\": \"sendbtn\"}]}");
		});
	});
};

removeNulls = function(obj) {
	var isArray = obj instanceof Array;
	for (var k in obj) {
		if (obj[k] === null) isArray ? obj.splice(k, 1) : delete obj[k];
		else if (typeof obj[k] == "object") removeNulls(obj[k]);
		if (isArray && obj.length == k) removeNulls(obj);
	}
	return obj;
}

getNdaFields = function() {
	// The fields for the sample document "NDA"
	// Create 4 fields, using anchors
	// * signer1sig
	// * signer1name
	// * signer1company
	// * signer1date

	// This method uses the SDK to create the fields data structure

	var signHereTab = new docusign.SignHere();
	signHereTab.setAnchorString("signer1sig");
	signHereTab.setAnchorXOffset("0");
	signHereTab.setAnchorYOffset("0");
	signHereTab.setAnchorUnits("mms");
	signHereTab.setRecipientId("1");
	signHereTab.setName("Please sign here");
	signHereTab.setOptional("false");
	signHereTab.setScaleValue(1);
	signHereTab.setTabLabel("signer1sig");
	var signHereTabs = [];
	signHereTabs.push(signHereTab);
	var fullNameTab = new docusign.FullName();
	fullNameTab.setAnchorString("signer1name");
	fullNameTab.setAnchorYOffset("-6");
	fullNameTab.setFontSize("Size12");
	fullNameTab.setRecipientId("1");
	fullNameTab.setTabLabel("Full Name");
	fullNameTab.setName("Full Name");
	var fullNameTabs = [];
	fullNameTabs.push(fullNameTab);
	var textTab = new docusign.Text();
	textTab.setAnchorString("signer1company");
	textTab.setAnchorYOffset("-8");
	textTab.setFontSize("Size12");
	textTab.setRecipientId("1");
	textTab.setTabLabel("Company");
	textTab.setName("Company");
	textTab.setRequired("false");
	var textTabs = [];
	textTabs.push(textTab);
	var dateSignedTab = new docusign.DateSigned();
	dateSignedTab.setAnchorString("signer1date");
	dateSignedTab.setAnchorYOffset("-6");
	dateSignedTab.setFontSize("Size12");
	dateSignedTab.setRecipientId("1");
	dateSignedTab.setName("Date Signed");
	dateSignedTab.setTabLabel("Company");
	var dateSignedTabs = [];
	dateSignedTabs.push(dateSignedTab);
	var fields = new docusign.Tabs();
	fields.setSignHereTabs(signHereTabs);
	fields.setFullNameTabs(fullNameTabs);
	fields.setTextTabs(textTabs);
	fields.setDateSignedTabs(dateSignedTabs);
	return fields;
}

WebhookLib.prototype.getDsSigner1Email = function() {
	return this.dsSigner1Email;
};

WebhookLib.prototype.getDsCC1Email = function() {
	return this.dsCC1Email;
};

WebhookLib.prototype.getDsCC1Name = function() {
	return this.dsCC1Name;
};

WebhookLib.prototype.statusItems = function(params, callback) {
	// List of info about the envelope's event items received
	var filesDirUrl = ((this.myUrl === null || this.myUrl === "") ? "/" : this.myUrl.substring(0, this.myUrl.indexOf('/') + 1)) + this.xmlFileDir;
	// remove http or https
	filesDirUrl = filesDirUrl.replace("http:", "").replace("https:", "");
	console.log("filesDirUrl=" + filesDirUrl);
	var filesDir = path.resolve(__filename + "/../../" + this.xmlFileDir + "E" + params.envelope_id);
	console.log("filesDir=" + filesDir);

	var results = [];
	if (!fs.existsSync(filesDir)) {
		console.log("results=" + JSON.stringify(results));
		return callback(results); // no results!
	}

	var files = fs.readdirSync(filesDir);
	for (var i in files) {
		var file = filesDir + "/" + files[i];
		console.log("file=" + file);
		if (path.extname(file) === ".xml") {
			statusItem(file, path.basename(file), filesDirUrl, function(result) {
				results.push(result);
			});
		}
	}
	console.log("results=" + JSON.stringify(results));
	return callback(results);
};

var statusItem = function(file, filename, filesDirUrl, callback) {
	// summary info about the notification
	var result = [];
	var data;
	var self = this;
	try {
		// read file from a local directory
		data = fs.readFileSync(file);
	} catch (ex) {
		return callback("{\"ok\": false, \"html\": \"<h3>Problem</h3><p>Couldn't load local xml test file: " + ex + "</p>\"}");
	}
	xmlParser.parseString(data, function(err, xml) {
		if (err || !xml) {
			throw new Error("Cannot parse Connect XML results: " + err);
		}

		console.log("Connect data parsed!");
		var envelopeStatus = xml.DocuSignEnvelopeInformation.EnvelopeStatus;
		var nodeList = envelopeStatus[0].RecipientStatuses[0].RecipientStatus;

		// iterate through the recipients
		var recipients = [];
		for (var i = 0; i < nodeList.length; i++) {
			var recipient = nodeList[i];
			recipients.push({
				"type": recipient.Type[0],
				"email": recipient.Email[0],
				"user_name": recipient.UserName[0],
				"routing_order": recipient.RoutingOrder[0],
				"sent_timestamp": (recipient.Sent ? recipient.Sent[0] : ""),
				"delivered_timestamp": (recipient.Delivered ? recipient.Delivered[0] : ""),
				"signed_timestamp": (recipient.Signed ? recipient.Signed[0] : ""),
				"status": (recipient.Status ? recipient.Status[0] : "")
			});
		}

		var documents = [];
		var envelopeId = envelopeStatus[0].EnvelopeID[0];
		// iterate through the documents if the envelope is Completed
		if ("Completed" === envelopeStatus[0].Status[0]) {
			// Loop through the DocumentPDFs element, noting each document.
			nodeList = xml.DocuSignEnvelopeInformation.DocumentPDFs[0].DocumentPDF;
			for (var i = 0; i < nodeList.length; i++) {
				var pdf = nodeList[i];
				var docFilename = "doc_" + (pdf.DocumentID ? pdf.DocumentID[0] : "") + ".pdf";
				documents.push({
					"document_ID": (pdf.DocumentID ? pdf.DocumentID[0] : ""),
					"document_type": pdf.DocumentType[0],
					"name": pdf.Name[0],
					"url": "E" + envelopeId + "/" + docFilename
				});
			}
		}

		result = {
			"envelope_id": envelopeId,
			"xml_url": "E" + envelopeId + "/" + path.basename(file),
			"time_generated": envelopeStatus[0].TimeGenerated[0],
			"subject": envelopeStatus[0].Subject[0],
			"sender_user_name": envelopeStatus[0].UserName[0],
			"sender_email": envelopeStatus[0].Email[0],
			"envelope_status": envelopeStatus[0].Status[0],
			"envelope_sent_timestamp": (envelopeStatus[0].Sent ? envelopeStatus[0].Sent[0] : ""),
			"envelope_created_timestamp": (envelopeStatus[0].Created ? envelopeStatus[0].Created[0] : ""),
			"envelope_delivered_timestamp": (envelopeStatus[0].Delivered ? envelopeStatus[0].Delivered[0] : ""),
			"envelope_signed_timestamp": (envelopeStatus[0].Signed ? envelopeStatus[0].Signed[0] : ""),
			"envelope_completed_timestamp": (envelopeStatus[0].Completed ? envelopeStatus[0].Completed[0] : ""),
			"timezone": xml.DocuSignEnvelopeInformation.TimeZone[0],
			"timezone_offset": xml.DocuSignEnvelopeInformation.TimeZoneOffset[0],
			"recipients": recipients,
			"documents": documents
		};
		return callback(result);
	});
}

WebhookLib.prototype.statusInfo = function(map, callback) {
	// Info about the envelope
	// Calls /accounts/{accountId}/envelopes/{envelopeId}
	var self = this;
	this.login(function(result) {
		if ("false" === result.ok) {
			return callback({"ok": false, "html": "<h3>Problem</h3><p>Couldn't login to DocuSign: " + result.errMsg + "</p>"});
		}
		var envelopesApi = new docusign.EnvelopesApi();
		envelopesApi.getEnvelope(self.dsAccountId, map.envelope_id, null, function(error, envelope, response) {
			if (error || !envelope || !envelope.envelopeId) {
				return callback({"ok": false, "html": "<h3>Problem</h3><p>Error calling DocuSign: " + error + "</p>"});
			}
			return callback(envelope);
		});
	});
};

module.exports = WebhookLib;