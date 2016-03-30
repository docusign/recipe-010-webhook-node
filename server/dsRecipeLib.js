const docusign = require('docusign-esign');

var dsUserEmail;
var dsUserPw;
var dsIntegrationId;
var dsAccountId;
var dsBaseUrl;
var dsAuthHeader;
var dsApiUrl = "https://demo.docusign.net/restapi"; // change for production
var myUrl; // url of the overall script
var tempEmailServer = "mailinator.com"; // Used for throw-away email addresses
var emailCount = 2; // Used to make email addresses unique.
var b64PwPrefix = "ZW5jb";
var b64PwClearPrefix = "encoded";
var authenticationApi;

module.exports.init = function(userEmail, userPw, integrationId, accountId) {
	// if accountId is null then the user's default account will be used
	// if dsUserEmail is "***" then environment variables are used

	if ("***" === userEmail) {
		userEmail = getEnv("DS_USER_EMAIL");
		userPw = getEnv("DS_USER_PW");
		integrationId = getEnv("DS_INTEGRATION_ID");
	}

	if ((userEmail == null) || (userEmail.length < 4)) {
		console.log(
			"<h3>No DocuSign login settings! Either set in the script or use environment variables userEmail, userPw, and integrationId</h3>");
	}
	// Decode the pw if it is in base64
	if (this.b64PwPrefix === userPw.substring(0, b64PwPrefix.length)) {
		// it was encoded
		userPw = new Buffer(userPw).toString('UTF-8');
		userPw = userPw.substring(0, b64PwClearPrefix.length); // remove
		// prefix
	}
	dsUserPw = userPw;
	dsUserEmail = userEmail;
	dsIntegrationId = integrationId;
	dsAccountId = accountId;
	// construct the authentication header:
	dsAuthHeader = "<DocuSignCredentials><Username>" + userEmail + "</Username><Password>" + userPw + "</Password><IntegratorKey>" + integrationId + "</IntegratorKey></DocuSignCredentials>";
	var apiClient = new docusign.ApiClient();
	apiClient.setBasePath(dsApiUrl);
	apiClient.addDefaultHeader("X-DocuSign-Authentication", dsAuthHeader);
	docusign.Configuration.default.setDefaultApiClient(apiClient);
	return docusign;
}

module.exports.curlAddCaInfo = function(curl) {
	// Add the bundle of trusted CA information to curl
	// In most environments, the list of trusted of CAs is set
	// at the OS level. However, some PAAS services such as
	// MS Azure App Service enable you to trust just the CAs that you
	// choose. So that's what we're doing here.
	// The usual list of trusted CAs is from Mozilla via the Curl
	// people.

	// curl_setopt($curl, CURLOPT_CAINFO, getcwd() .
	// "/assets_master/ca-bundle.crt");
}

module.exports.getSignerName = function(name) {
	if (!name || "***" === name) {
		name = this.getFakeName();
	}
	return name;
}

module.exports.getSignerEmail = function(email) {
	if (!!email && "***" !== email) {
		return email;
	} else {
		return this.makeTempEmail();
	}
}

module.exports.getTempEmailAccess = function(email) {
	// just create something unique to use with maildrop.cc
	// Read the email at http://maildrop.cc/inbox/<mailbox_name>
	var url = "https://mailinator.com/inbox2.jsp?public_to=";
	var parts = email.split("@");
	if (parts[1] !== tempEmailServer) {
		return null;
	}
	return url + parts[0];
}

module.exports.getTempEmailAccessQrcode = function(emailAccess) {
	// TODO Auto-generated method stub
	return null;
}

module.exports.login = function(callback) {
	var map = {};
	// Login (to retrieve baseUrl and accountId)

	// login call available off the AuthenticationApi
	authenticationApi = new docusign.AuthenticationApi();
	// login has some optional parameters we can set
	var options = new authenticationApi.LoginOptions();
	authenticationApi.login(options, function(error, loginInformation, response) {
		if (error || !loginInformation || loginInformation.getLoginAccounts().length < 1) {
			map.ok = "false";
			map.errMsg = "Error calling DocuSign login";
			callback(map);
		}
		// Example response:
		// { "loginAccounts": [
		// { "name": "DocuSign", "accountId": "1374267",
		// "baseUrl":
		// "https://demo.docusign.net/restapi/v2/accounts/1374267",
		// "isDefault": "true", "userName": "Recipe Login",
		// "userId": "d43a4a6a-dbe7-491e-9bad-8f7b4cb7b1b5",
		// "email": "temp2+recipe@kluger.com", "siteDescription": ""
		// }
		// ]}
		//

		var found = false;
		var errMsg = "";
		// Get account_id and base_url.
		if (!dsAccountId) {
			// Get default
			loginInformation.getLoginAccounts().forEach(function(account) {
				if ("true" === account.isDefault) {
					dsAccountId = account.accountId;
					dsBaseUrl = account.baseUrl;
					found = true;
				}
			}, this);
			if (!found) {
				errMsg = "Could not find default account for the username.";
			}
		} else {
			// get the account's base_url
			loginInformation.getLoginAccounts().forEach(function(account) {
				if (account.accountId === dsAccountId) {
					dsBaseUrl = account.baseUrl;
					found = true;
				}
			}, this);
			if (!found) {
				errMsg = "Could not find baseUrl for account " + this.dsAccountId;
			}
		}
		map.ok = found.toString();
		map.errMsg = errMsg;
		callback(map);
	});
}

module.exports.getDsAuthHeader = function() {
	return dsAuthHeader;
}

module.exports.getDsAccountId = function() {
	return dsAccountId;
}

module.exports.getDsBaseUrl = function() {
	return dsBaseUrl;
}

module.exports.getDsApiUrl = function() {
	return dsApiUrl;
}

module.exports.makeTempEmail = function() {
	// just create something unique to use with maildrop.cc
	// Read the email at http://maildrop.cc/inbox/<mailbox_name>
	var ip = "100";
	emailCount = Math.pow(emailCount, 2);

	var email = emailCount + new Date().getTime() + ip;
	email = new Buffer(email).toString('base64');
	email = email.replace("/[^a-zA-Z0-9]/g", "");
	email = email.substring(0, Math.min(25, email.length));

	return email + "@" + tempEmailServer;
}

module.exports.getTempEmailAccessQrcode = function(address) {
	// url = "http://open.visualead.com/?size=130&type=png&data=";
	var url = "https://chart.googleapis.com/chart?cht=qr&chs=150x150&chl=";
	url += encodeURIComponent(address);
	var size = 150;
	html = "<img height='" + size + "' width='" + size + "' src='" + url + "' alt='QR Code' style='margin:10px 0 10px;' />";
	return html;
}

module.exports.getMyUrl = function(url) {
	// Dynamically determine the script's url
	// For production use, this is not a great idea. Instead, set it
	// explicitly. Remember that for production, webhook urls must start with https!
	if (url != null) {
		// already set
		myUrl = url;
	} else {
		myUrl = getEnv("URL");
		myUrl = (!!myUrl && myUrl !== '') ? myUrl : "/";
	}
	return myUrl;
}

// See http://stackoverflow.com/a/8891890/64904
var urlOrigin = function(s, useForwardedHost) {
	var ssl = null;
	var sp = "http";
	var protocol = "http";
	var port = System.getenv("PORT");
	var host = System.getenv("IP");
	return protocol + "://" + host;
}

var fullUrl = function(s, useForwardedHost) {
	return this.urlOrigin(s, useForwardedHost); // + $s['REQUEST_URI'];
}

var rmQueryParameters = function(params) {
	var parts = params.split("?");
	return parts[0];
}

module.exports.getFakeName = function() {
	var firstNames = [
		"Verna", "Walter", "Blanche", "Gilbert", "Cody", "Kathy", "Judith", "Victoria", "Jason",
		"Meghan", "Flora", "Joseph", "Rafael", "Tamara", "Eddie", "Logan", "Otto", "Jamie", "Mark", "Brian",
		"Dolores", "Fred", "Oscar", "Jeremy", "Margart", "Jennie", "Raymond", "Pamela", "David", "Colleen",
		"Marjorie", "Darlene", "Ronald", "Glenda", "Morris", "Myrtis", "Amanda", "Gregory", "Ariana", "Lucinda",
		"Stella", "James", "Nathaniel", "Maria", "Cynthia", "Amy", "Sylvia", "Dorothy", "Kenneth", "Jackie"
	];
	var lastNames = [
		"Francisco", "Deal", "Hyde", "Benson", "Williamson", "Bingham", "Alderman", "Wyman",
		"McElroy", "Vanmeter", "Wright", "Whitaker", "Kerr", "Shaver", "Carmona", "Gremillion", "O'Neill",
		"Markert", "Bell", "King", "Cooper", "Allard", "Vigil", "Thomas", "Luna", "Williams", "Fleming", "Byrd",
		"Chaisson", "McLeod", "Singleton", "Alexander", "Harrington", "McClain", "Keels", "Jackson", "Milne",
		"Diaz", "Mayfield", "Burnham", "Gardner", "Crawford", "Delgado", "Pape", "Bunyard", "Swain", "Conaway",
		"Hetrick", "Lynn", "Petersen"
	];
	first = firstNames[Math.floor(Math.random() * firstNames.length)];
	last = lastNames[Math.floor(Math.random() * lastNames.length)];
	return first + " " + last;
}

/*
 * var varDumpRet(mixed) { //obStart(); varDump(mixed);
 * content = obGetContents(); obEndClean(); return content; }
 */

var getEnv = function(name) {
	// Turns out that sometimes the environment variables are
	// passed by $_SERVER for Apache. ?!
	var result = '';
	if (!!process.env[name]) {
		result = process.env[name];
	}
	return result;
}