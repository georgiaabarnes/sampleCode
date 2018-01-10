import { Component, OnInit, Renderer2, Inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import * as _ from 'lodash';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/forkJoin';
import { TranslateService } from '@ngx-translate/core';
import { DOCUMENT } from '@angular/platform-browser';
//enterprise specific imports

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})

export class HomeComponent extends BaseApplicationComponent<HomeComponent> implements OnInit {
    public errorMessage: string;
    public contracts: any[];
    public vehicleImageData: string;
    public clientID: string;
    public contractError = false;
    public customerNumber: number;
    public listLength = -1;
    public financialProducts: FinancialProductDTO[];
    public orderedContracts: ContractAccountDetailDTO[];
    public contractAccountDetails: ContractAccountDetailDTO[];
    public scheduledPayments: ScheduledItem[];
    public payoffs: Payoff[];
    public payoffError: boolean;
    public upaysLoaded: boolean;
    public payoffsLoaded: boolean;
    public activeContract: boolean;
    public firstName: string;
    public accountInfoService: AccountInfoService;

    constructor(
        private cashAccountViewService: CashAccountViewService,
        private customerACHService: CustomerACHService,
        private partnerContactService: PartnerContactService,
        _accountInfoService: AccountInfoService,
        private routerService: RouterService,
        private userService: UserService,
        private translateService: TranslateService,
        private filterService: FilterService,
        private logSiteActivityService: LogSiteActivityService,
        private fsTokenErrorHandler: FSTokenErrorHandler,
        private dialogService: DialogService,
        private contractualPayoffService: ContractualPayoffService,
        private activeContractAccountDetailsActions: ActiveContractAccountDetailsActions,
        private contractAccountDetailActions: ContractAccountDetailActions,
        private financialProductsActions: FinancialProductsActions,
        private contactActions: ContactActions,
        private accountNumberActions: AccountNumberActions,
        private customerNumberActions: CustomerNumberActions,
        @Inject(DOCUMENT) document,
        injector: Injector) {
        super(injector, document);
        this.scheduledPayments = [];
        this.customerNumber = null;
        this.accountInfoService = _accountInfoService;
        this.payoffs = [];

    }

    ngOnInit() {
        let gcid = this.userService.getGcid();
        super.getLoggerForComponent(this, this.store.getState().ApplicationConfig.CAMBER_LOGGING_NAME)
            .then(rtrn => {
                this.logger = rtrn;
                this.userService.resetPaymentHeaderDetails();
                super.setDataLoadedOnRequest(false);
                let contractInfo = this.getContractInfo().map(response => response);
                contractInfo.subscribe(response => { this.postGetContractInfo(response); });
            });
        super.emitAdobeScript(Constants.HomeComponentName);
    }

    private getContractInfo(): Observable<ContactInfo> {
      //store is the ngRedux store defined in the base component
        if (this.store.getState().Contact && this.store.getState().Contact.eDBCustomerNumber && this.store.getState().Contact.financialProducts) {
            let contactInfo = new ContactInfo();
            let contact = this.store.getState().Contact;
            if (contact) {
                contactInfo.customerNumber = contact.eDBCustomerNumber;
                contactInfo.financialProducts = contact.financialProducts;
            }
            return Observable.of(contactInfo);
        }
        else
        {
            return this.partnerContactService.getContactByGcidClientId()
                .flatMap((response) => { return this.afterGetContactByGcidSuccess(response, false); })
                .catch((error: any) => { return this.afterGetContactByGcidFailure(error); });
        }
    }

    private afterGetContactByGcidSuccess(response: any, refresh: boolean): Observable<ContactInfo> {
        if (!refresh) {
            this.store.dispatch(this.contactActions.setContact(response.contact));
        }
        let contactInfo = new ContactInfo();
        contactInfo.customerNumber = response.contact.eDBCustomerNumber;
        contactInfo.financialProducts = response.contact.financialProducts;
        return Observable.of(contactInfo);
    }

    private afterGetContactByGcidFailure(error: any): Observable<ContactInfo> {
        let contactInfo = new ContactInfo();
        contactInfo.error = true;
        this.fsTokenErrorHandler.handleFSTokenError(error);
        return Observable.of(contactInfo);
    }

    private dataIsCached(): boolean {
        return this.store.getState().Contact !== null;
    }

    private postGetContractInfo(response: ContactInfo): void {
        if (response.error) {
            let errorDesc = "";
            switch (response.errortype) {
                //enterprise fault handling
            }
            this.logger.logcritical(["Error occurred in: " + Constants.HomeComponentName + ", Gcid:" + this.userService.getGcid() + ", partnerContactService.getContractInfo, fault: " + errorDesc]);
            this.contractError = true;

            this.translateService.get("ngw.global.technical-error").subscribe((res: string) => {
                this.errorMessage = res;
            });
            this.promiseFinished();
        }
        else {
            let filteredFinancialProducts = this.filterService.getFilteredFinancialProducts(response.financialProducts);
            this.financialProducts = filteredFinancialProducts;
            this.enCodeImageUrl(this.financialProducts);
            this.customerNumber = response.customerNumber;
            this.userService.setCustomerNumber(this.customerNumber);
            this.firstName = this.store.getState().Contact.firstName;
            let accountNumbers = this.filterService.getFilteredAccountNumbers(response.financialProducts);
            this.cashAccountViewService.findAccounts(this.customerNumber, accountNumbers, false).map(contactDetail => contactDetail)
                .subscribe(contactDetail => { this.postFindAccounts(contactDetail); });
        }
    }

    private getContractAccountDetails(accountNumber: string): ContractAccountDetailDTO {
        let contractAccountDetail = _.find(this.contractAccountDetails, function (contractDetail) {
            return contractDetail.accountNumber === accountNumber;
        });
        return contractAccountDetail;
    }

    public getScheduledPayment(accountNumber: string): ScheduledItem {
        let scheduledItem = _.find(this.scheduledPayments, function (sp) {
            return sp.accountNumber === accountNumber;
        });
        return scheduledItem;
    }
    public getPayoff(fSAccountId: string): Payoff {
        let payoff = _.find(this.payoffs, function (p) {
            return p.fSAccountId === fSAccountId;
        });
        return payoff;
    }

    public showDueDate(contract: ContractAccountDetailDTO): boolean {
        return !this.accountInfoService.isPastDue(contract.currentBalance) && contract.nextPaymentDueDate !== null && contract.nextPaymentDueDate !== undefined
    }

    public getAmountLabel(amountDue: number): string {
        let amountLabel: string;
        if (amountDue > 0) {
            this.translateService.get("ngw.contract-list.lbl-positive-amount").subscribe((res: string) => {
                amountLabel = res;
            });
        } else {
            this.translateService.get("ngw.contract-list.lbl-negative-amount").subscribe((res: string) => {
                amountLabel = res;
            });
        }

        return amountLabel;
    }

    public getAccountCategoryLabel(portfolioCode: string): string {
        if (this.accountInfoService.getAccountCategory(portfolioCode) === Constants.LOAN) {
            return Constants.FINANCING;
        }
        return this.accountInfoService.getAccountCategory(portfolioCode);
    }

    public hasNoLastpayment(contractDetail: ContractAccountDetailDTO) {
        return contractDetail && contractDetail.lastPaymentAmount !== null && contractDetail.lastPaymentDate !== null;
    }

    public navigateToOneTimePayment(accountNumber): void {
        this.setContractDetails(accountNumber);
        this.routerService.navigateToPaymentEntry();
    }

    private setContractDetails(accountNumber: string): void {
        let contractDetail = this.getContractAccountDetails(accountNumber);
        this.store.dispatch(this.contractAccountDetailActions.setContractAccountDetail(contractDetail));
        this.store.dispatch(this.accountNumberActions.setAccountNumber(accountNumber));
        this.store.dispatch(this.customerNumberActions.setCustomerNumber(this.customerNumber));
    }

    public navigateToAccountDetails(accountNumber): void {
        this.setContractDetails(accountNumber);
        this.routerService.navigateToAccountDetails();
    }


    private promiseFinished(): void {
        super.setDataLoadedOnRequest(true);
    }

    private postFindAccounts(response: ContactDetail): void {
        if (response != undefined && response.error) {
            this.contractError = true;
            this.translateService.get("ngw.global.technical-error").subscribe((res: string) => {
                this.errorMessage = res;
            });
            this.promiseFinished();
        }
        else {
            this.listLength = 0;
            let self = this;
            let filteredContractDetails = _.filter(response.contractAccountDetails, function (cd) {
                return cd && self.accountInfoService.isActiveAccount(cd.statusCategoryCode);
            });
            this.store.dispatch(this.activeContractAccountDetailsActions.setActiveContracts(filteredContractDetails));
            this.contractAccountDetails = filteredContractDetails;
            if (filteredContractDetails.length === 0) {
                this.promiseFinished();
            }
            let promisesList = new Array();
            _.each(filteredContractDetails, function (accountDetails) {
                promisesList.push(self.customerACHService.findUpcomingUpays(accountDetails.accountNumber, false));
                promisesList.push(self.contractualPayoffService.calculatePayoff(accountDetails.fSAccountId, false));
            })

            Observable.forkJoin(promisesList).subscribe(responses => { this.postGetCalculatePayoffAndUPays(responses); });

            let accountNumbers: string[] = [];
            _.each(filteredContractDetails, function (accountDetails) {
                accountNumbers.push(accountDetails.accountNumber);
            })

            this.logSiteActivityService.logUserActivity(this.customerNumber, accountNumbers, ActivityTypes.Legitimizationcompleted);
            this.logSiteActivityService.logUserActivity(this.customerNumber, accountNumbers, ActivityTypes.MyAccountLogin);

            this.groupAndFilterContracts(this.contractAccountDetails);
        }
    }

    private groupAndFilterContracts(contracts: ContractAccountDetailDTO[]): void {

        let pastDueContracts = _.filter(contracts, function (product) {
            return product && product.currentBalance > 0;
        });
        let currentContracts = _.filter(contracts, function (product) {
            return product && product.totalAmountDue > 0 && product.currentBalance <= 0;
        });
        let paidContracts = _.filter(contracts, function (product) {
            return product && product.totalAmountDue <= 0 && product.currentBalance <= 0;
        });
        let orderedPastDueContracts = _.orderBy(pastDueContracts, function (pastDueContract) {
            return new Date(pastDueContract.nextPaymentDueDate);
        });
        let orderedCurrentContracts = _.orderBy(currentContracts, function (currentContract) {
            return new Date(currentContract.nextPaymentDueDate);
        });
        let orderedPaidContracts = _.sortBy(paidContracts, function (paidContract) {
            return new Date(paidContract.nextPaymentDueDate);
        });
        this.orderedContracts = orderedPastDueContracts.concat(orderedCurrentContracts, orderedPaidContracts);
        this.listLength = this.orderedContracts.length;
        if (this.listLength == 0) {
            this.translateService.get("ngw.contract-list.error.no-accounts").subscribe((res: string) => {
                this.errorMessage = res;
            });
        }
    }
    private postGetCalculatePayoffAndUPays(responses: any[]) {
        let upcomingUpayResponses: any[] = [];
        let payoffResponses: any[] = [];
        _.each(responses, function (response: any) {
            if (response instanceof ContactUpcoming) {
                upcomingUpayResponses.push(response);
            }
            else if (response instanceof Payoff) {
                payoffResponses.push(response);
            }
        })
        this.postFindUpcomingUpays(upcomingUpayResponses);
        this.postCalculatePayoff(payoffResponses);
        this.promiseFinished();
    }

    private postFindUpcomingUpays(responses: any[]): void {
        let contractUpComing = _.find(responses, function (contract) {
            return contract.error === true;
        });

        if (contractUpComing != undefined) {
            this.contractError = true;
            this.translateService.get("ngw.global.technical-error").subscribe((res: string) => {
                this.errorMessage = res;
            });
            this.logger.logcritical(["Error occurred in: " + Constants.HomeComponentName + ", Gcid:" + this.userService.getGcid() + ", customerACHService.findUpcomingUpays()."]);
        }
        else {
            responses.forEach((response) => {
                if (response.scheduledItem) {
                    this.scheduledPayments.push(response.scheduledItem);
                }
            });
        }

        this.promiseFinished();
    }

    private postCalculatePayoff(responses: any[]): void {

        let serviceError = _.find(responses, function (payoff) {
            return payoff.error;
        });

        if (serviceError != undefined) {
            this.payoffError = true;
            this.logger.logcritical(["Error occurred in: " + Constants.HomeComponentName + ", Gcid:" + this.userService.getGcid() + ", contractualPayoffService.calculatePayoff()."]);
        }
        else {
            responses.forEach((response) => {
                this.payoffs.push(response);
            });
        }
        this.promiseFinished();
    }

    private enCodeImageUrl(financialProducts: FinancialProductDTO[]): void {
        let isProdEnviornment = this.store.getState().EnvironmentConfig.PRODUCTION;
        let ImageURL = this.store.getState().EnvironmentConfig.Image_URL;
        _.each(financialProducts, function (financialProduct) {
          financialProduct.vehicleImageData = (isProdEnviornment && financialProduct.vehicleImageData.indexOf("Image-EU-100") == -1) ? ImageURL.concat('?', ImageURLEncoder.encode2(financialProduct.vehicleImageData)) : ImageURL + '?' + financialProduct.vehicleImageData;
        });
    }
}
